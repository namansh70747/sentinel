import { currentIdentity,getDatabase } from '../../../../../../../lib/auth';
export async function PUT(request:Request, context:{params:Promise<{workspaceId:string;serviceId:string}>}) {
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const identity=await currentIdentity();
 if(!identity)return Response.json({error:'Authentication required'},{status:401});
 const {workspaceId,serviceId}=await context.params;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(workspaceId)||!uuid.test(serviceId))return Response.json({error:'Invalid identifier'},{status:400});
 const db=getDatabase();
 const membership=await db.pool.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2',[workspaceId,identity.id]);
 if(membership.rows[0]?.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(!body||typeof body.availabilityTarget!=='number'||!(body.availabilityTarget>0&&body.availabilityTarget<1)||typeof body.latencyTargetMs!=='number'||!Number.isFinite(body.latencyTargetMs)||body.latencyTargetMs<=0||['goodQuery','totalQuery','latencyQuery'].some(k=>typeof body[k]!=='string'||!body[k].trim()||body[k].length>16384)||!body.goodQuery.includes('{window}')||!body.totalQuery.includes('{window}'))return Response.json({error:'Provide valid targets and queries; request queries require {window} placeholder.'},{status:400});
 const found=await db.inWorkspace(workspaceId,async client=>{
  if(!(await client.query('SELECT id FROM services WHERE workspace_id=$1 AND id=$2',[workspaceId,serviceId])).rowCount)return false;
  await client.query('INSERT INTO service_slos(workspace_id,service_id,availability_target,latency_target_ms,good_query,total_query,latency_query) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace_id,service_id) DO UPDATE SET availability_target=EXCLUDED.availability_target,latency_target_ms=EXCLUDED.latency_target_ms,good_query=EXCLUDED.good_query,total_query=EXCLUDED.total_query,latency_query=EXCLUDED.latency_query',[workspaceId,serviceId,body.availabilityTarget,body.latencyTargetMs,body.goodQuery,body.totalQuery,body.latencyQuery]);
  await db.appendAuditInTransaction(client,workspaceId,identity.id,'slo.configured',{serviceId,availabilityTarget:body.availabilityTarget,latencyTargetMs:body.latencyTargetMs});return true;
 });
 return found?Response.json({ok:true}):Response.json({error:'Service not found'},{status:404});
}
