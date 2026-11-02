import { describe,expect,it,vi } from 'vitest';
import { collectSlo } from './slo';
import type { PrometheusClient } from './prometheus';
const mapping={availabilityTarget:.999,latencyTargetMs:300,goodQuery:'good[{window}]',totalQuery:'total[{window}]',latencyQuery:'latency'};
const now=1700000000000;
function client(value:(q:string)=>number, timestamp=now/1000) {return {query:vi.fn(async(q:string)=>[{metric:{},value:[timestamp,String(value(q))]}])} as unknown as PrometheusClient;}
describe('live SLI evidence validation',()=>{
 it('collects all four windows and a latency observation',async()=>{
  const sample=await collectSlo(client(q=>q.startsWith('good')?999:q.startsWith('total')?1000:150),mapping,now);
  expect(sample.good5m).toBe(999);expect(sample.total6h).toBe(1000);expect(sample.p99_10m_ms).toBe(150);
 });
 it('refuses stale, absent traffic and impossible good counts',async()=>{
  await expect(collectSlo(client(()=>1,now/1000-121),mapping,now)).rejects.toThrow('Stale');
  await expect(collectSlo(client(()=>0),mapping,now)).rejects.toThrow('absent');
  await expect(collectSlo(client(q=>q.startsWith('good')?2:1),mapping,now)).rejects.toThrow('Invalid');
 });
});
