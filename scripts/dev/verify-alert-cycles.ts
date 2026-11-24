import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { SentinelDatabase } from '@sentinel/db';
import { normalizeGrafanaAlerts } from '@sentinel/connectors';

loadEnvFile('.local/compose.env');
const db = new SentinelDatabase('postgres://sentinel_app:' + encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD!) + '@127.0.0.1:55441/sentinel');
const workspace = randomUUID();
const prefix = 'accept-' + workspace.slice(0, 8);
const base = 'http://127.0.0.1:3012';
const headers = {
 authorization: 'Basic ' + Buffer.from('admin:' + process.env.GF_SECURITY_ADMIN_PASSWORD).toString('base64'),
 'content-type': 'application/json',
};
const cleanup: string[] = [];
async function grafana(path: string, method = 'GET', body?: unknown) {
 const response = await fetch(base + path, { method, headers, body:body === undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(10000) });
 if (!response.ok) throw new Error(`Grafana ${method} ${path} returned ${response.status}`);
 return response.status === 204 ? null : response.json();
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
 const search = new URLSearchParams({...window,q:`{resource.service.name="${service.traceService}"}`,limit:'5'});
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
  return {service:service.name,traceId,traceLookupMs,searchMs,searchReturnedTarget:data.traces.some((row:{traceID:string})=>row.traceID===traceId)};
 },45000);
}
try {
 const [template] = await grafana(api+'/alert-rules');
 if (!template?.data?.[0]?.model) throw Error('Expected existing local rule template');
 await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspace,prefix]);
 const selection=process.argv[2];
 if(selection&&!services.some(s=>s.name===selection))throw Error('Choose checkout or payments');
 for(const service of services.filter(s=>!selection||s.name===selection)){
  const id=randomUUID(),endpoint=randomUUID(),secret=randomBytes(32).toString('hex');
  await db.inWorkspace(workspace,async c=>{
   await c.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,'local acceptance','000000000000','local','fixture')",[workspace,id,service.name]);
   await c.query('INSERT INTO webhook_endpoints(id,workspace_id,service_id,secret_hash) VALUES($1,$2,$3,$4)',[endpoint,workspace,id,createHash('sha256').update(secret).digest('hex')]);
  });
  const name=prefix+'-'+service.name;
  const contact={uid:name,name,type:'webhook',disableResolveMessage:false,settings:{url:'http://console:3010/api/webhooks/grafana/'+endpoint,httpMethod:'POST',headers:{'x-sentinel-secret':secret}}};
  await grafana(api+'/contact-points','POST',contact);
  cleanup.unshift(api+'/contact-points/'+name);
  for(let cycle=1;cycle<=2;cycle++){
   const uid=name+'-'+cycle;
   const {id:_id,updated:_updated,provenance:_provenance,...rule}=structuredClone(template);
   Object.assign(rule,{uid,title:uid,ruleGroup:uid,for:'0s',noDataState:'OK',execErrState:'OK',labels:{service:service.name,acceptance:prefix},notification_settings:{receiver:name,group_by:['alertname'],group_wait:'1s',group_interval:'15s',repeat_interval:'4h'}});
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
   const incident=await poll('Sentinel delivery '+uid,()=>db.inWorkspace(workspace,async c=>(await c.query("SELECT incident_id FROM incident_signals WHERE service_id=$1 AND status='firing' AND dedupe_key=ANY($2::text[])",[id,keys])).rows[0]?.incident_id));
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
   console.log(JSON.stringify({service:service.name,cycle,incident,investigation,resolution,loki,replayQueued:0,tempo:sample}));
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
