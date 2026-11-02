import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { workspaceAccess,isUuid } from '../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../lib/auth';
export async function POST(request:Request,context:{params:Promise<{workspaceId:string}>}) {
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(typeof body?.serviceId!=='string'||!isUuid(body.serviceId))return Response.json({error:'Registered service required'},{status:400});
 const db=getDatabase(),id=randomUUID(),secret=randomBytes(32).toString('base64url');
 const created=await db.inWorkspace(workspaceId,async client=>{
  if(!(await client.query('SELECT id FROM services WHERE workspace_id=$1 AND id=$2',[workspaceId,body.serviceId])).rowCount)return false;
  await client.query('INSERT INTO webhook_endpoints(id,workspace_id,service_id,secret_hash) VALUES($1,$2,$3,$4)',[id,workspaceId,body.serviceId,createHash('sha256').update(secret).digest('hex')]);
  await db.appendAuditInTransaction(client,workspaceId,access.identity.id,'webhook.created',{endpointId:id,serviceId:body.serviceId});return true;
 });
 return created?Response.json({id,url:new URL(`/api/webhooks/grafana/${id}`,process.env.SENTINEL_PUBLIC_URL!).href,header:'x-sentinel-secret',secret},{status:201,headers:{'cache-control':'no-store'}}):Response.json({error:'Service not found'},{status:404});
}
export async function GET(_:Request,context:{params:Promise<{workspaceId:string}>}) {
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 const rows=await getDatabase().pool.query('SELECT id,service_id,created_at,disabled_at FROM webhook_endpoints WHERE workspace_id=$1 ORDER BY created_at DESC',[workspaceId]);
 return Response.json(rows.rows,{headers:{'cache-control':'no-store'}});
}
export async function DELETE(request:Request,context:{params:Promise<{workspaceId:string}>}) {
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(typeof body?.endpointId!=='string'||!isUuid(body.endpointId))return Response.json({error:'Valid endpoint required'},{status:400});
 const db=getDatabase();
 const revoked=await db.inWorkspace(workspaceId,async client=>{
  await client.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[workspaceId]);
  const updated=await client.query('UPDATE webhook_endpoints SET disabled_at=now() WHERE workspace_id=$1 AND id=$2 AND disabled_at IS NULL RETURNING id',[workspaceId,body.endpointId]);
  if(!updated.rowCount)return false;
  await db.appendAuditInTransaction(client,workspaceId,access.identity.id,'webhook.revoked',{endpointId:body.endpointId});return true;
 });
 return Response.json({revoked},{status:revoked?200:404});
}
