import { createHash,generateKeyPairSync,randomBytes,randomUUID,sign } from 'node:crypto';
import { beforeAll,afterAll,describe,expect,it } from 'vitest';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { SentinelDatabase } from '@sentinel/db';
import { signPlaybook,executionPlanHash } from '@sentinel/policy/signatures';
import { PlanApprovals,evidenceHash,reserveApprovalProof,type ExecutionPlan } from './index';
const databaseUrl=process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('plan-bound approval verification',()=>{
 const db=new SentinelDatabase(databaseUrl!);
 const signer=generateKeyPairSync('ed25519'),authenticator=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const workspaceId=randomUUID(),identityId=randomUUID(),serviceId=randomUUID(),incidentId=randomUUID();
 const rawSession=randomBytes(32).toString('base64url'),credentialId=randomBytes(32).toString('base64url');
 const resourceArn='arn:aws:ecs:us-east-1:123456789012:service/test/web';
 const approvals=new PlanApprovals(db,'http://localhost:3010',signer.publicKey);
 let plan:ExecutionPlan,planHash:string;
 function assertion(challenge:string,counter:number,flags=5):AuthenticationResponseJSON {
  const clientData=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:'http://localhost:3010',crossOrigin:false}));
  const authData=Buffer.alloc(37);createHash('sha256').update('localhost').digest().copy(authData);authData[32]=flags;authData.writeUInt32BE(counter,33);
  const signed=Buffer.concat([authData,createHash('sha256').update(clientData).digest()]);
  return {id:credentialId,rawId:credentialId,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:clientData.toString('base64url'),authenticatorData:authData.toString('base64url'),signature:sign('sha256',signed,authenticator.privateKey).toString('base64url')}};
 }
 beforeAll(async()=>{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspaceId,'approval test']);
  await db.pool.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3)',[identityId,'https://id.example',identityId]);
  await db.pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'admin')",[workspaceId,identityId]);
  await db.pool.query("INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(rawSession).digest('hex'),identityId]);
  const jwk=authenticator.publicKey.export({format:'jwk'});
  const cose=Buffer.concat([Buffer.from([0xa5,0x01,0x02,0x03,0x26,0x20,0x01,0x21,0x58,0x20]),Buffer.from(jwk.x!,'base64url'),Buffer.from([0x22,0x58,0x20]),Buffer.from(jwk.y!,'base64url')]);
  await db.pool.query('INSERT INTO passkeys(id,identity_id,public_key,counter) VALUES($1,$2,$3,0)',[credentialId,identityId,cose]);
  await db.inWorkspace(workspaceId,async c=>{
   await c.query('INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,serviceId,'checkout','team','123456789012','us-east-1',resourceArn]);
   await c.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'bad deploy','advised','sev1')",[workspaceId,incidentId,serviceId]);
   const evidence=(await c.query("INSERT INTO incident_evidence(workspace_id,incident_id,service_id,source,sample,severity,outcome,provenance,detail) VALUES($1,$2,$3,'prometheus',$4,'sev1','ok','live',$4) RETURNING *",[workspaceId,incidentId,serviceId,{good:980,total:1000}])).rows[0];
   const expiry=new Date(Date.now()+300000).toISOString();
   const playbook=signPlaybook({id:'rollback-last-deploy',serviceId,resourceArn,version:1,expiresAt:expiry},signer.privateKey);
   plan={workspaceId,serviceId,resourceArn,playbookId:playbook.id,playbookVersion:1,fromRevision:'web:2',toRevision:'web:1',evidenceHash:evidenceHash(evidence),expiresAt:expiry};
   planHash=executionPlanHash(plan);
   await c.query('INSERT INTO execution_plans(workspace_id,id,incident_id,service_id,plan_hash,plan,signed_playbook) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,randomUUID(),incidentId,serviceId,planHash,plan,playbook]);
  });
 });
 afterAll(()=>db.close());
 it('rejects other sessions and altered plan hashes',async()=>{
  await expect(approvals.begin(workspaceId,identityId,'wrong',planHash)).rejects.toThrow('access denied');
  await expect(approvals.begin(workspaceId,identityId,rawSession,'a'.repeat(64))).rejects.toThrow('unavailable');
 });
 it('refuses a tampered playbook signature and a downgraded member',async()=>{
  const altered={...plan,toRevision:'web:older'};
  const alteredHash=executionPlanHash(altered);
  const signed=signPlaybook({id:plan.playbookId,serviceId,resourceArn,version:1,expiresAt:plan.expiresAt},signer.privateKey);
  signed.signature=Buffer.alloc(64,7).toString('base64');
  await db.inWorkspace(workspaceId,async c=>{await c.query('INSERT INTO execution_plans(workspace_id,id,incident_id,service_id,plan_hash,plan,signed_playbook) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,randomUUID(),incidentId,serviceId,alteredHash,altered,signed]);});
  await expect(approvals.begin(workspaceId,identityId,rawSession,alteredHash)).rejects.toThrow('signature');
  await db.pool.query("UPDATE workspace_memberships SET role='viewer' WHERE workspace_id=$1 AND identity_id=$2",[workspaceId,identityId]);
  try {await expect(approvals.begin(workspaceId,identityId,rawSession,planHash)).rejects.toThrow('access denied');}
  finally {await db.pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1 AND identity_id=$2",[workspaceId,identityId]);}
 });
 it('refuses stale evidence even when the plan and signature are valid',async()=>{
  const staleIncident=randomUUID();
  let staleHash="";
  await db.inWorkspace(workspaceId,async c=>{
   await c.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'stale','advised','sev1')",[workspaceId,staleIncident,serviceId]);
   const evidence=(await c.query("INSERT INTO incident_evidence(workspace_id,incident_id,service_id,source,sample,severity,outcome,provenance,detail,collected_at) VALUES($1,$2,$3,'prometheus',$4,'sev1','ok','live',$4,now()-interval '6 minutes') RETURNING *",[workspaceId,staleIncident,serviceId,{good:980,total:1000}])).rows[0];
   const stalePlan={...plan,evidenceHash:evidenceHash(evidence)};
   staleHash=executionPlanHash(stalePlan);
   const signed=signPlaybook({id:plan.playbookId,serviceId,resourceArn,version:1,expiresAt:plan.expiresAt},signer.privateKey);
   await c.query('INSERT INTO execution_plans(workspace_id,id,incident_id,service_id,plan_hash,plan,signed_playbook) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,randomUUID(),staleIncident,serviceId,staleHash,stalePlan,signed]);
  });
  await expect(approvals.begin(workspaceId,identityId,rawSession,staleHash)).rejects.toThrow('stale');
 });
 it('verifies a real signed assertion and prevents reuse',async()=>{
  const challenge=await approvals.begin(workspaceId,identityId,rawSession,planHash);
  const response=assertion(challenge.options.challenge,1);
  const result=await approvals.complete(workspaceId,identityId,rawSession,planHash,challenge.challengeId,response);
  expect(result.planHash).toBe(planHash);
  const input={workspaceId,identityId,session:rawSession,planHash,proofId:result.approvalId};
  const otherPlan=executionPlanHash({...plan,toRevision:'web:older'});
  await expect(db.inWorkspace(workspaceId,c=>c.query('INSERT INTO proof_reservations(workspace_id,id,proof_id,plan_hash) VALUES($1,$2,$3,$4)',[workspaceId,randomUUID(),result.approvalId,otherPlan]))).rejects.toThrow('foreign key');
  await expect(reserveApprovalProof(db,{...input,session:'wrong'})).rejects.toThrow('access denied');
  await expect(reserveApprovalProof(db,{...input,planHash:'f'.repeat(64)})).rejects.toThrow('unavailable');
  const attempts=await Promise.allSettled([reserveApprovalProof(db,input),reserveApprovalProof(db,input)]);
  expect(attempts.filter(item=>item.status==='fulfilled')).toHaveLength(1);
  const success=attempts.find(item=>item.status==='fulfilled');
  expect(success?.status==='fulfilled'&&success.value.executionAuthorized).toBe(false);

  await expect(approvals.complete(workspaceId,identityId,rawSession,planHash,challenge.challengeId,response)).rejects.toThrow('already used');
  const events=await db.inWorkspace(workspaceId,async c=>(await c.query("SELECT action FROM audit_events WHERE action='plan.approval_verified'")).rows);
  expect(events).toHaveLength(1);
 });
 it('requires authenticator user verification',async()=>{
  const challenge=await approvals.begin(workspaceId,identityId,rawSession,planHash);
  await expect(approvals.complete(workspaceId,identityId,rawSession,planHash,challenge.challengeId,assertion(challenge.options.challenge,2,1))).rejects.toThrow();
 });
});
