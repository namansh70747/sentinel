import { createHash,randomUUID,type KeyLike } from 'node:crypto';
import { generateAuthenticationOptions,verifyAuthenticationResponse,type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { canonicalJson,type SentinelDatabase } from '@sentinel/db';
import { executionPlanHash,verifyPlaybook,type SignedPlaybook } from '@sentinel/policy/signatures';
import type { PoolClient } from 'pg';

export type ExecutionPlan = Parameters<typeof executionPlanHash>[0];
export function evidenceHash(evidence:{workspace_id:string;incident_id:string;service_id:string;source:string;sample:unknown;severity:string;collected_at:Date}) {
 return createHash('sha256').update(canonicalJson([evidence.workspace_id,evidence.incident_id,evidence.service_id,evidence.source,evidence.sample,evidence.severity,new Date(evidence.collected_at).toISOString()])).digest('hex');
}
const hashSession=(session:string)=>createHash('sha256').update(session).digest('hex');
export class PlanApprovals {
 private readonly rpId:string;
 constructor(private readonly db:SentinelDatabase,private readonly origin:string,private readonly publicKey:KeyLike) {
  const url=new URL(origin);
  if(url.origin!==origin||(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Invalid passkey origin');
  this.rpId=url.hostname;
 }
 private async authorize(client:PoolClient,workspaceId:string,identityId:string,session:string,planHash:string) {
  const membership=await client.query("SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2 AND role='admin' FOR SHARE",[workspaceId,identityId]);
  const activeSession=await client.query('SELECT identity_id FROM sessions WHERE token_hash=$1 AND identity_id=$2 AND expires_at>now() FOR SHARE',[hashSession(session),identityId]);
  if(!membership.rowCount||!activeSession.rowCount)throw new Error('Approval access denied');
  const found=await client.query(`SELECT p.*,s.resource_arn,i.state,e.source,e.sample,e.severity,e.collected_at FROM execution_plans p JOIN services s ON s.workspace_id=p.workspace_id AND s.id=p.service_id JOIN incidents i ON i.workspace_id=p.workspace_id AND i.id=p.incident_id AND i.service_id=p.service_id JOIN incident_evidence e ON e.workspace_id=p.workspace_id AND e.incident_id=p.incident_id AND e.service_id=p.service_id AND e.source='prometheus' AND e.provenance='live' WHERE p.workspace_id=$1 AND p.plan_hash=$2 FOR SHARE OF s,i`,[workspaceId,planHash]);
  if(!found.rowCount)throw new Error('Plan or evidence unavailable');
  const row=found.rows[0],plan=row.plan as ExecutionPlan,playbook=row.signed_playbook as SignedPlaybook;
  if(!plan||!playbook||plan.workspaceId!==workspaceId||plan.serviceId!==row.service_id||plan.resourceArn!==row.resource_arn||plan.playbookId!=='rollback-last-deploy'||plan.playbookId!==playbook.id||plan.playbookVersion!==playbook.version||!plan.fromRevision||!plan.toRevision||plan.fromRevision===plan.toRevision||!['advised','awaiting_approval'].includes(row.state))throw new Error('Plan is not eligible for approval');
  const expiry=Date.parse(plan.expiresAt),playbookExpiry=Date.parse(playbook.expiresAt);
  if(!Number.isFinite(expiry)||expiry<=Date.now()||expiry>playbookExpiry||!verifyPlaybook(playbook,this.publicKey,{serviceId:row.service_id,resourceArn:row.resource_arn})||executionPlanHash(plan)!==planHash)throw new Error('Plan signature, hash or expiry is invalid');
  const collectedAt=new Date(row.collected_at).getTime();
  if(!Number.isFinite(collectedAt)||collectedAt<Date.now()-300000||collectedAt>Date.now()+30000)throw new Error('Plan evidence is stale');
  const observed=evidenceHash({workspace_id:workspaceId,incident_id:row.incident_id,service_id:row.service_id,source:row.source,sample:row.sample,severity:row.severity,collected_at:row.collected_at});
  if(observed!==plan.evidenceHash)throw new Error('Plan evidence changed');
  return {plan,incidentId:row.incident_id};
 }
 async begin(workspaceId:string,identityId:string,session:string,planHash:string) {
  return this.db.inWorkspace(workspaceId,async client=>{
   await this.authorize(client,workspaceId,identityId,session,planHash);
   const credentials=await client.query('SELECT id FROM passkeys WHERE identity_id=$1',[identityId]);
   if(!credentials.rowCount)throw new Error('No passkey registered');
   const options=await generateAuthenticationOptions({rpID:this.rpId,userVerification:'required',allowCredentials:credentials.rows.map(row=>({id:row.id}))});
   const id=randomUUID();
   await client.query("INSERT INTO passkey_challenges(id,identity_id,session_hash,challenge,purpose,plan_hash,workspace_id,expires_at) VALUES($1,$2,$3,$4,'approval',$5,$6,now()+interval '2 minutes')",[id,identityId,hashSession(session),options.challenge,planHash,workspaceId]);
   return {challengeId:id,options};
  });
 }
 async complete(workspaceId:string,identityId:string,session:string,planHash:string,challengeId:string,response:AuthenticationResponseJSON) {
  const challenge=await this.db.pool.query("DELETE FROM passkey_challenges WHERE id=$1 AND identity_id=$2 AND session_hash=$3 AND purpose='approval' AND plan_hash=$4 AND workspace_id=$5 AND expires_at>now() RETURNING challenge",[challengeId,identityId,hashSession(session),planHash,workspaceId]);
  if(!challenge.rowCount)throw new Error('Approval challenge expired or already used');
  return this.db.inWorkspace(workspaceId,async client=>{
   const {plan,incidentId}=await this.authorize(client,workspaceId,identityId,session,planHash);
   const credential=(await client.query('SELECT * FROM passkeys WHERE id=$1 AND identity_id=$2 FOR UPDATE',[response.id,identityId])).rows[0];
   if(!credential)throw new Error('Unknown passkey');
   const verification=await verifyAuthenticationResponse({response,expectedChallenge:challenge.rows[0].challenge,expectedOrigin:this.origin,expectedRPID:this.rpId,requireUserVerification:true,credential:{id:credential.id,publicKey:new Uint8Array(credential.public_key),counter:Number(credential.counter),transports:credential.transports}});
   if(!verification.verified)throw new Error('Passkey verification failed');
   await client.query('UPDATE passkeys SET counter=$1 WHERE id=$2',[verification.authenticationInfo.newCounter,credential.id]);
   const id=randomUUID(),expiresAt=new Date(Math.min(Date.now()+120000,Date.parse(plan.expiresAt))).toISOString();
   await client.query('INSERT INTO approval_proofs(workspace_id,id,plan_hash,identity_id,credential_id,session_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,id,planHash,identityId,credential.id,hashSession(session),expiresAt]);
   await this.db.appendAuditInTransaction(client,workspaceId,identityId,'plan.approval_verified',{planHash,incidentId,approvalId:id,expiresAt});
   return {approvalId:id,planHash,expiresAt};
  });
 }
}

/** Reserves a verified proof once. This is not an execution authorization. */
export async function reserveApprovalProof(db:SentinelDatabase,input:{workspaceId:string;proofId:string;planHash:string;identityId:string;session:string}) {
 return db.inWorkspace(input.workspaceId,async client=>{
  const sessionHash=hashSession(input.session);
  const role=await client.query("SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2 AND role='admin' FOR SHARE",[input.workspaceId,input.identityId]);
  const session=await client.query('SELECT identity_id FROM sessions WHERE token_hash=$1 AND identity_id=$2 AND expires_at>now() FOR SHARE',[sessionHash,input.identityId]);
  if(!role.rowCount||!session.rowCount)throw new Error('Reservation access denied');
  const id=randomUUID();
  const row=await client.query(`INSERT INTO proof_reservations(workspace_id,id,proof_id,plan_hash)
   SELECT p.workspace_id,$1,p.id,p.plan_hash FROM approval_proofs p
   WHERE p.workspace_id=$2 AND p.id=$3 AND p.plan_hash=$4 AND p.identity_id=$5 AND p.session_hash=$6 AND p.expires_at>now()
   ON CONFLICT(workspace_id,proof_id) DO NOTHING RETURNING id`,[id,input.workspaceId,input.proofId,input.planHash,input.identityId,sessionHash]);
  if(!row.rowCount)throw new Error('Approval proof unavailable, expired or already reserved');
  await db.appendAuditInTransaction(client,input.workspaceId,input.identityId,'approval.reserved',{approvalId:input.proofId,planHash:input.planHash,reservationId:id});
  return {reservationId:id,executionAuthorized:false as const};
 });
}
