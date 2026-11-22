import { ConnectorHttpClient,ConnectorHttpError } from './http';
import { PrometheusClient } from './prometheus';
import { collectSlo } from './slo';
import { assessCoverage } from './coverage';

export interface BoundTelemetry {
 config:Record<string,string|number>;
 mapping:Record<string,string|number>;
 secret:Record<string,string>;
}
export function providerHeaders(connection:BoundTelemetry){
 const headers:Record<string,string>={};
 if(connection.secret.token)headers.authorization=`Bearer ${connection.secret.token}`;
 if(connection.config.tenantId)headers['X-Scope-OrgID']=String(connection.config.tenantId);
 return headers;
}
function endpoint(connection:BoundTelemetry,path:string){return new URL(String(connection.config.endpoint).replace(/\/$/,'')+path);}

export async function collectBoundLogs(connection:BoundTelemetry,http=new ConnectorHttpClient(),now=Date.now()){
 const start=BigInt(now-900000)*1000000n,end=BigInt(now)*1000000n;
 const url=endpoint(connection,'/loki/api/v1/query_range');
 url.searchParams.set('query',String(connection.mapping.query));url.searchParams.set('start',String(start));url.searchParams.set('end',String(end));url.searchParams.set('limit','20');
 const body=await http.json(url.href,providerHeaders(connection)) as {status?:string;data?:{resultType?:string;result?:{values?:unknown[]}[]}};
 if(body.status!=='success'||body.data?.resultType!=='streams'||!Array.isArray(body.data.result)||body.data.result.length>1000)throw new ConnectorHttpError('invalid-response');
 const lines:[string,string][]=[];
 for(const stream of body.data.result){
  if(!Array.isArray(stream.values))throw new ConnectorHttpError('invalid-response');
  for(const value of stream.values){
   if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||!/^\d{1,20}$/.test(value[0])||typeof value[1]!=='string'||value[1].length>65536)throw new ConnectorHttpError('invalid-response');
   const time=BigInt(value[0]);if(time>=start&&time<=end&&lines.length<20)lines.push([value[0],value[1]]);
  }
 }
 const traceIds=[...new Set(lines.flatMap(([,line])=>Array.from(line.matchAll(/(?:trace_id|traceId)["\s:=]+([a-f0-9]{32})/gi),match=>match[1].toLowerCase())))].slice(0,20);
 return {lines,traceIds,queryWindow:{start:new Date(now-900000).toISOString(),end:new Date(now).toISOString()}};
}

export async function collectBoundTraces(connection:BoundTelemetry,http=new ConnectorHttpClient(),now=Date.now()){
 const url=endpoint(connection,'/api/search');
 url.searchParams.set('q',`{resource.service.name=${JSON.stringify(connection.mapping.serviceName)}}`);
 url.searchParams.set('start',String(Math.floor((now-900000)/1000)));url.searchParams.set('end',String(Math.floor(now/1000)));url.searchParams.set('limit','5');
 const headers=providerHeaders(connection),body=await http.json(url.href,headers) as {traces?:unknown[]};
 if(!Array.isArray(body.traces)||body.traces.length>1000)throw new ConnectorHttpError('invalid-response');
 const traces=[];
 for(const raw of body.traces.slice(0,5)){
  if(!raw||typeof raw!=='object'||!('traceID' in raw)||typeof raw.traceID!=='string'||!/^[a-f0-9]{32}$/i.test(raw.traceID))throw new ConnectorHttpError('invalid-response');
  const detail=await http.json(endpoint(connection,`/api/traces/${raw.traceID}`).href,headers);
  if(!detail||typeof detail!=='object'||Array.isArray(detail))throw new ConnectorHttpError('invalid-response');
  traces.push({traceId:raw.traceID,summary:raw,detail});
 }
 return {traces,queryWindow:{start:new Date(now-900000).toISOString(),end:new Date(now).toISOString()}};
}

/** Coverage is measured from the actual three SLI input series, never exporter up. */
export async function collectBoundMetrics(connection:BoundTelemetry,targets:{availabilityTarget:number;latencyTargetMs:number},http=new ConnectorHttpClient(),now=Date.now()){
 const client=new PrometheusClient({url:String(connection.config.endpoint),token:connection.secret.token,headers:providerHeaders(connection),transport:http,evaluationTime:now/1000});
 const mapping=connection.mapping;
 const sample=await collectSlo(client,{...targets,goodQuery:String(mapping.goodQuery),totalQuery:String(mapping.totalQuery),latencyQuery:String(mapping.latencyQuery)},now);
 const series=await Promise.all(['goodCoverageQuery','totalCoverageQuery','latencyCoverageQuery'].map(async key=>{
  const rows=await client.queryMatrix(String(mapping[key]));
  // Each selector identifies one SLI input stream. Multi-series aggregation
  // requires an explicit mapping, not combining unrelated scrape targets.
  return {input:key,rows};
 }));
 const end=now/1000,interval=Number(mapping.scrapeIntervalSeconds??15);
 const coverage=[300,600,1800,3600,21600].map(seconds=>({windowSeconds:seconds,inputs:series.map(({input,rows})=>({input,...assessCoverage(rows.length===1?rows[0].values.map(([timestamp,value])=>[timestamp,Number.isFinite(Number(value))?'1':'0']):[],end-seconds,end,interval)}))}));
 return {sample,coverage,queryWindow:{start:new Date(now-21600000).toISOString(),end:new Date(now).toISOString()}};
}
