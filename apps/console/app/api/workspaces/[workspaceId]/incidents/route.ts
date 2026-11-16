import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../../../../lib/auth';
import { workspaceAccess,isUuid } from '../../../../../lib/workspace-access';
export async function GET(_:Request,context:{params:Promise<{workspaceId:string}>}) {
 const {workspaceId}=await context.params;const access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 const rows=await getDatabase().inWorkspace(workspaceId,async client=>(await client.query(`SELECT i.*,j.dispatched_at,(SELECT e.severity FROM incident_evidence e WHERE e.workspace_id=i.workspace_id AND e.incident_id=i.id AND e.source='prometheus' AND e.outcome IN ('ok','uncovered')) AS observed_severity,COALESCE((SELECT json_agg(json_build_object('source',e.source,'outcome',e.outcome,'provenance',e.provenance,'observed_at',e.observed_at,'window_covered',e.window_covered,'detail',e.detail) ORDER BY e.source) FROM incident_evidence e WHERE e.workspace_id=i.workspace_id AND e.incident_id=i.id),'[]') AS sources FROM incidents i LEFT JOIN investigation_jobs j ON j.workspace_id=i.workspace_id AND j.incident_id=i.id ORDER BY i.created_at DESC LIMIT 100`)).rows);
 return Response.json(rows,{headers:{'cache-control':'no-store'}});
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string}>}) {
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId}=await context.params;const access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!['admin','responder'].includes(access.role))return Response.json({error:'Responder access required'},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(!body||typeof body.serviceId!=='string'||!isUuid(body.serviceId)||typeof body.title!=='string'||!body.title.trim()||body.title.length>500)return Response.json({error:'Provide a registered service and title (1–500 characters)'},{status:400});
 const db=getDatabase(),id=randomUUID();
 const found=await db.inWorkspace(workspaceId,async client=>{
  if(!(await client.query('SELECT id FROM services WHERE workspace_id=$1 AND id=$2',[workspaceId,body.serviceId])).rowCount)return false;
  await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,$4,'investigating','sev4')",[workspaceId,id,body.serviceId,body.title.trim()]);
  await client.query('INSERT INTO investigation_jobs(workspace_id,incident_id,service_id) VALUES($1,$2,$3)',[workspaceId,id,body.serviceId]);
  await db.appendAuditInTransaction(client,workspaceId,access.identity.id,'incident.requested',{incidentId:id,serviceId:body.serviceId});return true;
 });
 return found?Response.json({id,state:'investigating',dispatch:'queued',severity:'pending evidence'},{status:202}):Response.json({error:'Service not found'},{status:404});
}
