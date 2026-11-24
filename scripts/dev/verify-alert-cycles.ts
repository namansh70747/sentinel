import { readFile } from 'node:fs/promises';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { InvestigationRepository } from '@sentinel/db/investigations';
import { CollaborationRepository } from '@sentinel/db/collaboration';
import { SecretVault } from '@sentinel/connectors/secrets';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { SentinelDatabase } from '@sentinel/db';
import { normalizeGrafanaAlerts } from '@sentinel/connectors';

loadEnvFile('.local/compose.env');
const db = new SentinelDatabase('postgres://sentinel_app:' + encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD!) + '@127.0.0.1:55441/sentinel');
const workspace = randomUUID();
const connectors=new ConnectorRepository(db,await SecretVault.fromFile('.local/connector-key'));
const runs=new InvestigationRepository(db);
const collaboration=new CollaborationRepository(db);
const actor=JSON.parse(await readFile('.local/owner.json','utf8'));
const identity=(await db.pool.query('SELECT id FROM identities WHERE issuer=$1 AND subject=$2',[actor.issuer,actor.subject])).rows[0];
if(!identity)throw Error('Local acceptance operator unavailable');
const prefix = 'accept-' + workspace.slice(0, 8);
const base = 'http://127.0.0.1:3024';
const headers: Record<string,string> = {
 authorization: 'Basic ' + Buffer.from('admin:' + process.env.GF_SECURITY_ADMIN_PASSWORD).toString('base64'),
 'content-type': 'application/json',
};
const cleanup: string[] = [];

async function grafana(path: string, method = 'GET', body?: unknown) {
 const response = await fetch(base + path, { method, headers, body:body === undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(10000) });
 if (!response.ok) throw new Error(`Grafana ${method} ${path} returned ${response.status}`);
 const text=await response.text();
 return text ? JSON.parse(text) : null;
}
async function poll<T>(label: string, read: () => Promise<T | undefined>, ms = 150000): Promise<T> {
 const end = Date.now() + ms;
 while (Date.now() < end) {
  const value = await read();
  if (value !== undefined) return value;
  await delay(1500);
 }
 throw new Error(label + ' timed out');
}
const api = '/api/v1/provisioning';
const services = [
 {name:'checkout',port:9464,job:'workload',traceService:'workload'},
 {name:'payments',port:9465,job:'workload-payments',traceService:'payments'},
];
async function request(port:number, fail:boolean) {
 const response = await fetch(`http://127.0.0.1:${port}/${fail?'fail':'ok'}`,{signal:AbortSignal.timeout(8000)});
 await response.arrayBuffer();
 if (response.status !== (fail?500:200)) throw Error('Unexpected workload response');
 return {traceId:response.headers.get('x-trace-id'), requestId:response.headers.get('x-request-id')};
}
async function tempoSample(service:typeof services[number], traceId:string, start:number) {
 const window = {start:String(Math.floor(start/1000)-5),end:String(Math.ceil(Date.now()/1000)+5)};
 const search = new URLSearchParams({...window,q:`{resource.service.name="${service.traceService}"}`,limit:'100'});
 const lookup = new URLSearchParams(window);
 return poll('Tempo trace availability',async()=>{
  const begin=performance.now();
  const response=await fetch('http://127.0.0.1:3200/api/traces/'+traceId+'?'+lookup,{signal:AbortSignal.timeout(8000)});
  await response.arrayBuffer();
  const traceLookupMs=Math.round(performance.now()-begin);
  if(response.status===404)return;
  if(!response.ok)throw Error('Tempo lookup HTTP '+response.status);
  const searchStart=performance.now();
  const found=await fetch('http://127.0.0.1:3200/api/search?'+search,{signal:AbortSignal.timeout(15000)});
  if(!found.ok)throw Error('Tempo search HTTP '+found.status);
  const data=await found.json();
  const searchMs=Math.round(performance.now()-searchStart);
  if(!data.traces?.length)return;
  return {service:service.name,traceId,traceLookupMs,traceLookupVerified:true,searchMs,searchReturnedTarget:data.traces.some((row:{traceID:string})=>row.traceID===traceId)};
 },45000);
}
try {
 const source=await fetch('http://127.0.0.1:3012'+api+'/alert-rules',{headers,signal:AbortSignal.timeout(10000)});
 if(!source.ok)throw Error('Could not read the local Grafana rule template');
 const original=(await source.json()).find((rule:{uid:string})=>rule.uid==='sentinel-workload-failures');
 if (!original?.data?.[0]?.model) throw Error('Expected existing local rule template');
 const alerts=await grafana(api+'/alert-rules');
 const contacts=await grafana(api+'/contact-points');
 if(alerts.some((rule:{uid:string})=>!rule.uid.startsWith('accept-'))||
  contacts.some((contact:{uid:string;type:string})=>contact.type==='webhook'&&!contact.uid.startsWith('accept-')))throw Error('Expected dedicated acceptance Grafana');

 const datasources=await grafana('/api/datasources');
 if(!datasources.some((source:{uid:string})=>source.uid==='sentinel-prometheus')){
  await grafana('/api/datasources','POST',{uid:'sentinel-prometheus',name:'Acceptance Prometheus',type:'prometheus',access:'proxy',url:'http://prometheus:9090'});
 }
 const folder=await grafana('/api/folders','POST',{title:prefix});
 const template={...original,orgID:1,folderUID:folder.uid};
 await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspace,prefix]);
 await db.inWorkspace(workspace,c=>c.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'admin')",[workspace,identity.id]));
 const prometheus=await connectors.create(workspace,identity.id,{provider:'prometheus',name:'Acceptance metrics',mode:'live',config:{endpoint:'http://prometheus:9090'}},{});
 const selection=process.argv[2];
 if(selection&&!services.some(s=>s.name===selection))throw Error('Choose checkout or payments');
 for(const service of services.filter(s=>!selection||s.name===selection)){
  const id=randomUUID(),endpoint=randomUUID(),secret=randomBytes(32).toString('hex');
  await db.inWorkspace(workspace,async c=>{
   await c.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,'local acceptance','000000000000','local','fixture')",[workspace,id,service.name]);
   await c.query('INSERT INTO webhook_endpoints(id,workspace_id,service_id,secret_hash) VALUES($1,$2,$3,$4)',[endpoint,workspace,id,createHash('sha256').update(secret).digest('hex')]);
  });
  const selector=`{job="${service.job}"}`;
  const metrics={
   goodQuery:`sum(increase(workload_requests_good${selector}[{window}]))`,
   totalQuery:`sum(increase(workload_requests_total${selector}[{window}]))`,
   latencyQuery:`1000 * histogram_quantile(0.99, sum by (le) (rate(workload_request_duration_seconds_bucket${selector}[10m])))`,
   goodCoverageQuery:`workload_requests_good${selector}[6h]`,
   totalCoverageQuery:`workload_requests_total${selector}[6h]`,
   latencyCoverageQuery:`workload_request_duration_seconds_count${selector}[6h]`,
   scrapeIntervalSeconds:15,
  };
  await connectors.bind(workspace,identity.id,id,'prometheus',prometheus.id,prometheus.configVersion,metrics);
  await db.inWorkspace(workspace,c=>c.query('INSERT INTO service_slos(workspace_id,service_id,availability_target,latency_target_ms,good_query,total_query,latency_query) VALUES($1,$2,.99,500,$3,$4,$5)',[workspace,id,metrics.goodQuery,metrics.totalQuery,metrics.latencyQuery]));
  const name=prefix+'-'+service.name;
  const contact={uid:name,name,type:'webhook',disableResolveMessage:false,settings:{url:'http://console:3010/api/webhooks/grafana/'+endpoint,httpMethod:'POST',headers:{'x-sentinel-secret':secret}}};
  await grafana(api+'/contact-points','POST',contact);
  cleanup.unshift(api+'/contact-points/'+name);
  // Grafana reconciles contact points asynchronously before rules can use them.
  await delay(65000);
  for(let cycle=1;cycle<=2;cycle++){
   const uid=name+'-'+cycle;
   const {id:_id,updated:_updated,provenance:_provenance,...rule}=structuredClone(template);
   Object.assign(rule,{uid,title:uid,isPaused:false,ruleGroup:uid,for:'0s',noDataState:'OK',execErrState:'OK',labels:{service:service.name,acceptance:prefix},notification_settings:{receiver:name,group_by:['alertname'],group_wait:'1s',group_interval:'15s',repeat_interval:'4h'}});
   rule.data[0].model.expr=`sum(increase(workload_requests_total{job="${service.job}"}[45s]) - increase(workload_requests_good{job="${service.job}"}[45s]))`;
   rule.data[1].model.expression='$A > 0';
   await grafana(api+'/alert-rules','POST',rule);
   cleanup.unshift(api+'/alert-rules/'+uid);
   const groupPath=api+'/folder/'+template.folderUID+'/rule-groups/'+uid;
   const group=await grafana(groupPath);
   await grafana(groupPath,'PUT',{...group,interval:10});
   const start=Date.now();
   const first=await request(service.port,true);
   let firing:any;
   await poll('Grafana firing '+uid,async()=>{
    await request(service.port,true);
    const alerts=await grafana('/api/alertmanager/grafana/api/v2/alerts');
    firing=alerts.find((a:any)=>a.labels.alertname===uid);
    return firing||undefined;
   });
   const payload={alerts:[{...firing,status:'firing'}]};
   const keys=normalizeGrafanaAlerts(payload)[0].compatibleDedupeKeys;
   const incident=await poll('Sentinel delivery '+uid,async()=>{
    await request(service.port,true);
    return db.inWorkspace(workspace,async c=>(await c.query("SELECT incident_id FROM incident_signals WHERE service_id=$1 AND status='firing' AND dedupe_key=ANY($2::text[])",[id,keys])).rows[0]?.incident_id);
   });
   const replay=await fetch('http://127.0.0.1:3010/api/webhooks/grafana/'+endpoint,{method:'POST',headers:{'content-type':'application/json','x-sentinel-secret':secret},body:JSON.stringify(payload)});
   if(replay.status!==202 || (await replay.json()).investigationsQueued!==0)throw Error('Replay did not deduplicate');
   const [investigation,resolution,sample,loki]=await Promise.all([
    poll('Temporal evidence '+uid,()=>db.inWorkspace(workspace,async c=>{
     const row=(await c.query('SELECT state,(SELECT count(*)::int FROM incident_evidence WHERE incident_id=i.id) AS sources FROM incidents i WHERE id=$1 AND service_id=$2',[incident,id])).rows[0];
     return row?.sources===8&&['advised','escalated'].includes(row.state)?row:undefined;
    })),
    poll('Grafana resolved '+uid,async()=>{
     await request(service.port,false);
     return db.inWorkspace(workspace,async c=>(await c.query("SELECT 1 FROM incident_signals WHERE incident_id=$1 AND status='resolved'",[incident])).rowCount?true:undefined);
    }),
    tempoSample(service,first.traceId!,start),
    poll('Loki trace correlation '+uid,async()=>{
     const query=new URLSearchParams({query:`{service_name="${service.traceService}"} |= "${first.requestId}"`,start:String(BigInt(start-5000)*1000000n),end:String(BigInt(Date.now()+1000)*1000000n),limit:'20'});
     const response=await fetch('http://127.0.0.1:3100/loki/api/v1/query_range?'+query,{signal:AbortSignal.timeout(8000)});
     if(!response.ok)throw Error('Loki query failed');
     const body=await response.json();
     return body.data.result.some((stream:{values:[string,string][]})=>stream.values.some(([,line])=>line.includes(first.traceId!)))?true:undefined;
    },45000),
   ]);
   const scopes=(await db.pool.query('SELECT id FROM workspaces WHERE id<>$1',[workspace])).rows;
   for(const scope of scopes){
    const leaked=await db.inWorkspace(scope.id,async c=>(await c.query('SELECT 1 FROM incidents WHERE workspace_id=$1 AND title=$2 LIMIT 1',[scope.id,uid])).rowCount);
    if(leaked)throw Error('Alert appeared outside its acceptance workspace');
   }
   const state=await db.inWorkspace(workspace,async c=>(await c.query('SELECT state_version FROM incidents WHERE id=$1',[incident])).rows[0]);
   const verifying=await collaboration.transition(workspace,identity.id,incident,'verifying','Alert resolved; checking service recovery',Number(state.state_version));
   if(verifying.error)throw Error('Could not enter recovery verification: '+verifying.error);
   const recovery=await poll('Sentinel recovered '+uid,async()=>{
    for(let i=0;i<10;i++)await request(service.port,false);
    await delay(16000);
    const run=await runs.create(workspace,incident,identity.id);
    const detail=await poll('Fresh recovery evidence '+uid,async()=>{
     const value=await runs.get(workspace,run.id);
     return value?.finished_at?value:undefined;
    },60000);
    const result=await collaboration.transition(workspace,identity.id,incident,'recovered','Fresh observations meet service targets',verifying.stateVersion!);
    if(result.error==='unrecovered')return;
    if(result.error)throw Error('Recovery transition failed: '+result.error);
    return {run:run.id,source:detail.evidence.find(e=>e.source==='prometheus')?.outcome,state:result.state};
   },420000);
   console.log(JSON.stringify({routeIsolated:true,service:service.name,cycle,incident,investigation,resolution,recovery,loki,replayQueued:0,tempo:sample}));
   await grafana(api+'/alert-rules/'+uid,'DELETE');
   cleanup.shift();
  }
  const sampleStart=Date.now(),third=await request(service.port,false);
  console.log(JSON.stringify({tempo:await tempoSample(service,third.traceId!,sampleStart)}));
 }
}finally{
 for(const path of cleanup)try{await grafana(path,'DELETE');}catch{console.error('Grafana cleanup failed for '+path);}
 await db.close();
}
