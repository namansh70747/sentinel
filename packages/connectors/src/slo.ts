import { PrometheusClient } from './prometheus';
import type { SliWindows } from '@sentinel/contracts';
export interface SloMapping { availabilityTarget:number; latencyTargetMs:number; goodQuery:string; totalQuery:string; latencyQuery:string }
export async function collectSlo(client:PrometheusClient, mapping:SloMapping, now=Date.now()):Promise<SliWindows> {
 if (!(mapping.availabilityTarget>0&&mapping.availabilityTarget<1) || !(mapping.latencyTargetMs>0) || !Number.isFinite(mapping.latencyTargetMs)) throw new Error('Invalid SLO targets');
 const scalar=async(query:string)=>{
  const values=await client.query(query);
  if(values.length!==1)throw new Error('SLI query must return exactly one series');
  const [timestamp,raw]=values[0].value;
  if(timestamp*1000<now-120000 || timestamp*1000>now+30000)throw new Error('Stale SLI observation');
  return Number(raw);
 };
 if(!mapping.goodQuery.includes('{window}') || !mapping.totalQuery.includes('{window}'))throw new Error('Request queries require {window} placeholder');
 const counts=await Promise.all(['5m','30m','1h','6h'].map(async window=>{
  const [good,total]=await Promise.all([scalar(mapping.goodQuery.replaceAll('{window}',window)),scalar(mapping.totalQuery.replaceAll('{window}',window))]);
  if(total<=0||good<0||good>total)throw new Error('Invalid or absent request counts');
  return {good,total};
 }));
 const latency=await scalar(mapping.latencyQuery);
 if(latency<0)throw new Error('Invalid latency');
 return {availabilitySlo:mapping.availabilityTarget,latencySloMs:mapping.latencyTargetMs,good5m:counts[0].good,total5m:counts[0].total,good30m:counts[1].good,total30m:counts[1].total,good1h:counts[2].good,total1h:counts[2].total,good6h:counts[3].good,total6h:counts[3].total,p99_10m_ms:latency,dataLoss:false};
}
