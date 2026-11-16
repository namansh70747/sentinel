import { createPublicKey } from 'node:crypto';
import { cookies } from 'next/headers';
import { PlanApprovals } from '@sentinel/approvals';
import { getDatabase } from '../../../../../lib/auth';
import { isUuid,workspaceAccess } from '../../../../../lib/workspace-access';
export const dynamic='force-dynamic';
export async function GET(_:Request,context:{params:Promise<{workspaceId:string}>}) {
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 const plans=await getDatabase().inWorkspace(workspaceId,async client=>(await client.query('SELECT id,incident_id,service_id,plan_hash,plan,created_at FROM execution_plans ORDER BY created_at DESC LIMIT 100')).rows);
 return Response.json({plans,approvalConfigured:Boolean(process.env.SENTINEL_PLAYBOOK_PUBLIC_KEY),canApprove:access.role==='admin'},{headers:{'cache-control':'no-store'}});
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string}>}) {
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 const raw=(await cookies()).get('sentinel_session')?.value, pem=process.env.SENTINEL_PLAYBOOK_PUBLIC_KEY;
 if(!raw||!pem||!process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Approval signing key is not configured'},{status:503});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(!body||typeof body.planHash!=='string'||!/^[a-f0-9]{64}$/.test(body.planHash)||!['begin','complete'].includes(body.action))return Response.json({error:'Invalid approval request'},{status:400});
 try {
  const key=createPublicKey(pem);if(key.asymmetricKeyType!=='ed25519')throw new Error('Invalid signing key');
  const approval=new PlanApprovals(getDatabase(),process.env.SENTINEL_PUBLIC_URL,key);
  if(body.action==='begin')return Response.json(await approval.begin(workspaceId,access.identity.id,raw,body.planHash),{headers:{'cache-control':'no-store'}});
  if(typeof body.challengeId!=='string'||!isUuid(body.challengeId)||!body.response)return Response.json({error:'Invalid passkey response'},{status:400});
  return Response.json(await approval.complete(workspaceId,access.identity.id,raw,body.planHash,body.challengeId,body.response),{headers:{'cache-control':'no-store'}});
 }catch{return Response.json({error:'Approval could not be verified. Check plan validity, access, session and passkey.'},{status:400});}
}
