import { createHash,randomUUID,timingSafeEqual } from 'node:crypto';
import { normalizeGrafanaAlerts } from '@sentinel/connectors';
import { getDatabase } from '../../../../../lib/auth';
import { isUuid } from '../../../../../lib/workspace-access';
export async function POST(request:Request,context:{params:Promise<{endpointId:string}>}) {
 const {endpointId}=await context.params;
 if(!isUuid(endpointId))return Response.json({error:'Endpoint not found'},{status:404});
 const secret=request.headers.get('x-sentinel-secret');
 if(!secret||secret.length>512)return Response.json({error:'Invalid webhook credentials'},{status:401});
 const db=getDatabase(),endpoint=(await db.pool.query('SELECT * FROM webhook_endpoints WHERE id=$1 AND disabled_at IS NULL',[endpointId])).rows[0];
 if(!endpoint||!timingSafeEqual(Buffer.from(endpoint.secret_hash,'hex'),createHash('sha256').update(secret).digest()))return Response.json({error:'Invalid webhook credentials'},{status:401});
 const reader=request.body?.getReader();if(!reader)return Response.json({error:'JSON body required'},{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144){await reader.cancel();return Response.json({error:'Delivery exceeds 256 KiB'},{status:413});}chunks.push(part.value);}
 let signals;try{signals=normalizeGrafanaAlerts(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{return Response.json({error:'Invalid Grafana alert delivery'},{status:400});}
 const count=await db.inWorkspace(endpoint.workspace_id,async client=>{
  await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[endpoint.workspace_id]);
  if(!(await client.query('SELECT id FROM webhook_endpoints WHERE id=$1 AND disabled_at IS NULL FOR SHARE',[endpointId])).rowCount)return -1;
  let queued=0;
  for(const signal of signals){
   const inserted=await client.query('INSERT INTO webhook_deliveries(endpoint_id,dedupe_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING endpoint_id',[endpointId,signal.dedupeKey]);
   if(!inserted.rowCount)continue;
   // Resolution notifications are recorded, never treated as verified SLI recovery.
   if(signal.status==='firing'){
    const id=randomUUID();
    await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,$4,'investigating','sev4')",[endpoint.workspace_id,id,endpoint.service_id,signal.title]);
    await client.query('INSERT INTO investigation_jobs(workspace_id,incident_id,service_id) VALUES($1,$2,$3)',[endpoint.workspace_id,id,endpoint.service_id]);queued++;
   }
   await db.appendAuditInTransaction(client,endpoint.workspace_id,'grafana-webhook','signal.received',{endpointId,status:signal.status,dedupeKey:signal.dedupeKey});
  }return queued;
 });
 return count<0?Response.json({error:"Webhook revoked"},{status:401}):Response.json({accepted:true,investigationsQueued:count},{status:202});
}
