import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { SentinelDatabase } from '@sentinel/db';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';
import type { Provider } from '@sentinel/connectors/config';

loadEnvFile('.local/compose.env');
const owner=JSON.parse(await readFile('.local/owner.json','utf8'));
const db=new SentinelDatabase(`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD??'')}@127.0.0.1:55441/sentinel`);
try{
 const serviceId=await db.inWorkspace(owner.workspaceId,async client=>{
  const previous=(await client.query("SELECT id FROM services WHERE workspace_id=$1 AND name='checkout-api' AND account_id='000000000000' AND resource_arn='arn:aws:ecs:ap-south-1:000000000000:service/sentinel-demo/checkout-api'",[owner.workspaceId])).rows;
  if(previous.length>1)throw new Error('Ambiguous local fixture services; select a mapping in the UI');
  if(previous.length)return previous[0].id as string;
  const id=randomUUID();await client.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'checkout-api','local-owner','000000000000','ap-south-1','arn:aws:ecs:ap-south-1:000000000000:service/sentinel-demo/checkout-api')",[owner.workspaceId,id]);
  await db.appendAuditInTransaction(client,owner.workspaceId,'local-bootstrap','service.registered',{serviceId:id,fixture:true});return id;
 });
 const intake=spawnSync(process.execPath,['--import','tsx','scripts/dev/connect-local.ts',owner.workspaceId],{stdio:'inherit',env:process.env});
 if(intake.status!==0)throw new Error('Local authenticated intake bootstrap failed');
 const webhook=JSON.parse(await readFile(`.local/grafana-${owner.workspaceId}.json`,'utf8'));
 const repository=new ConnectorRepository(db,await SecretVault.fromFile('.local/connector-key'));
 const fixtures:{provider:Provider;endpoint:string;mapping:Record<string,string|number>}[]=[
  {provider:'prometheus',endpoint:'http://prometheus:9090',mapping:{goodQuery:'sum(increase(workload_requests_good[{window}]))',totalQuery:'sum(increase(workload_requests_total[{window}]))',latencyQuery:'1000 * histogram_quantile(0.99, sum by (le) (rate(workload_request_duration_seconds_bucket[10m])))',goodCoverageQuery:'workload_requests_good[6h]',totalCoverageQuery:'workload_requests_total[6h]',latencyCoverageQuery:'workload_request_duration_seconds_count[6h]',scrapeIntervalSeconds:15}},
  {provider:'loki',endpoint:'http://loki:3100',mapping:{query:'{service_name="workload"}'}},
  {provider:'tempo',endpoint:'http://tempo:3200',mapping:{serviceName:'workload'}},
  {provider:'grafana',endpoint:'http://grafana:3000',mapping:{endpointId:webhook.id}},
 ];
 for(const fixture of fixtures){
  const name=`Local ${fixture.provider}`,existing=(await repository.list(owner.workspaceId)).find(row=>row.provider===fixture.provider&&row.name===name);
  if(existing&&existing.config.endpoint!==fixture.endpoint)throw new Error(`Existing ${name} endpoint differs; it was preserved. Resolve through the UI.`);
  const connector=existing??await repository.create(owner.workspaceId,'local-bootstrap',{provider:fixture.provider,name,mode:'live',config:{endpoint:fixture.endpoint}},{});
  const bindings=await repository.bindings(owner.workspaceId,serviceId);
  if(!bindings.some(binding=>binding.provider===fixture.provider))await repository.bind(owner.workspaceId,'local-bootstrap',serviceId,fixture.provider,connector.id,connector.configVersion,fixture.mapping);
 }
 // This imports only the dedicated self-hosted test topic. Hosted publishing
 // approval and service subscriptions are deliberately separate operations.
 try{
  const local=JSON.parse(await readFile('.local/ntfy/connection.json','utf8'));
  if(local.endpoint!=='http://ntfy:80')throw new Error('Local ntfy endpoint changed; configure it through the UI');
  const existing=(await repository.list(owner.workspaceId)).find(row=>row.provider==='ntfy'&&row.name==='Local ntfy');
  if(!existing)await repository.create(owner.workspaceId,'local-bootstrap',{provider:'ntfy',name:'Local ntfy',mode:'live',config:{endpoint:local.endpoint,topic:local.topic}},{token:(await readFile('.local/ntfy/token','utf8')).trim()});
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;console.log('Local ntfy authentication is not configured; telemetry import is unaffected.');}
 console.log('Explicit local connector import complete. Existing connections and bindings preserved. Recreate Grafana to load the registered webhook; capability tests still required.');
}finally{await db.close();}
