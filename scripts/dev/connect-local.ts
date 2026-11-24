import { loadEnvFile } from 'node:process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SentinelDatabase } from '@sentinel/db';

for(const file of ['.env','.local/compose.env'])try{loadEnvFile(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const workspaceId=process.argv[2];
if(!workspaceId||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(workspaceId))throw new Error('Provide the local workspace UUID');
const connection=process.env.DATABASE_URL??`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD??'')}@127.0.0.1:55441/sentinel`;
const databaseUrl=new URL(connection);
if(!['postgres:','postgresql:'].includes(databaseUrl.protocol)||!['localhost','127.0.0.1','[::1]'].includes(databaseUrl.hostname)||databaseUrl.pathname!=='/sentinel')throw new Error('Local bootstrap is restricted to the loopback sentinel database');
await mkdir('.local',{recursive:true,mode:0o700});
const target=process.argv[3]??'checkout-api';
if(target!=='checkout-api'&&target!=='payments-api')throw new Error('Unsupported local workload');
const payments=target==='payments-api';
const region=payments?'local':'ap-south-1';
const metricJob=payments?'workload-payments':'workload';
const selector=`{job="${metricJob}"}`;
const bindingFile=`.local/grafana-${workspaceId}${payments?'-payments':''}.json`;
let previous:{id:string;secret:string}|undefined;
try{previous=JSON.parse(await readFile(bindingFile,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const db=new SentinelDatabase(connection);
try{
 const binding=await db.inWorkspace(workspaceId,async client=>{
  const services=await client.query("SELECT id FROM services WHERE workspace_id=$1 AND name=$2 AND account_id='000000000000' AND resource_arn=$3",[workspaceId,target,`arn:aws:ecs:${region}:000000000000:service/sentinel-demo/${target}`]);
  if(services.rowCount!==1)throw new Error('Register exactly one matching local fixture service first');
  const serviceId=services.rows[0].id;
  await client.query(`INSERT INTO service_slos(workspace_id,service_id,availability_target,latency_target_ms,good_query,total_query,latency_query)
   VALUES($1,$2,.999,300,$3,$4,$5) ON CONFLICT(workspace_id,service_id) DO NOTHING`,[workspaceId,serviceId,`sum(increase(workload_requests_good${selector}[{window}]))`,`sum(increase(workload_requests_total${selector}[{window}]))`,`1000 * histogram_quantile(0.99, sum by (le) (rate(workload_request_duration_seconds_bucket${selector}[10m])))`]);
  let endpoint=previous;
  if(endpoint){const valid=await client.query('SELECT id FROM webhook_endpoints WHERE id=$1 AND workspace_id=$2 AND service_id=$3 AND secret_hash=$4 AND disabled_at IS NULL',[endpoint.id,workspaceId,serviceId,createHash('sha256').update(endpoint.secret).digest('hex')]);if(!valid.rowCount)endpoint=undefined;}
  if(!endpoint){endpoint={id:randomUUID(),secret:randomBytes(32).toString('base64url')};await client.query('INSERT INTO webhook_endpoints(id,workspace_id,service_id,secret_hash) VALUES($1,$2,$3,$4)',[endpoint.id,workspaceId,serviceId,createHash('sha256').update(endpoint.secret).digest('hex')]);await db.appendAuditInTransaction(client,workspaceId,'local-bootstrap','webhook.created',{endpointId:endpoint.id,serviceId});}
  await db.appendAuditInTransaction(client,workspaceId,'local-bootstrap','slo.configured',{serviceId,source:'local-histogram-template'});
  return {...endpoint,workspaceId,serviceId};
 });
 await writeFile(bindingFile,JSON.stringify(binding,null,2),{mode:0o600});
 const content=await readFile('.local/compose.env','utf8');
 const updates:Record<string,string>=payments?{SENTINEL_PAYMENTS_GRAFANA_ENDPOINT_ID:binding.id,SENTINEL_PAYMENTS_WEBHOOK_SECRET:binding.secret}:{SENTINEL_CONFIG_WORKSPACE_ID:workspaceId,SENTINEL_GRAFANA_ENDPOINT_ID:binding.id,SENTINEL_WEBHOOK_SECRET:binding.secret};
 const retained=content.split('\n').filter(line=>line&&!Object.keys(updates).some(key=>line.startsWith(`${key}=`)));
 await writeFile('.local/compose.env',retained.concat(Object.entries(updates).map(([key,value])=>`${key}=${JSON.stringify(value)}`)).join('\n')+'\n',{mode:0o600});
 console.log(JSON.stringify({workspaceId,serviceId:binding.serviceId,endpointId:binding.id,configured:['local SLOs','Grafana authenticated intake'],secretFile:bindingFile}));
}finally{await db.close();}
