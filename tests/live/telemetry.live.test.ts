import { describe, expect, it } from 'vitest';
import { LokiClient, PrometheusClient, TempoClient } from '@sentinel/connectors';

describe.skipIf(process.env.TEST_LIVE_TELEMETRY !== 'true')('actual local telemetry ingestion',()=>{
 it('records a real failed request in metrics, logs, trace search and trace retrieval',async()=>{
  const start=Date.now();
  const response=await fetch('http://127.0.0.1:9464/fail',{signal:AbortSignal.timeout(5000)});
  await response.text();
  expect(response.status).toBe(500);
  const requestId=response.headers.get('x-request-id'),traceId=response.headers.get('x-trace-id');
  expect(requestId).toBeTruthy();expect(traceId).toMatch(/^[a-f0-9]{32}$/);
  const prometheus=new PrometheusClient({url:'http://127.0.0.1:9090'});
  await expect.poll(async()=>{
   const rows=await prometheus.query('sum(workload_requests_total - workload_requests_good)');
   return Number(rows[0]?.value[1]??0);
  },{timeout:45000,interval:1000}).toBeGreaterThanOrEqual(1);
  const loki=new LokiClient('http://127.0.0.1:3100');
  await expect.poll(async()=>{
   const lines=await loki.queryRange(`{job="workload"} |= "${requestId}"`,String(BigInt(start-1000)*1000000n),String(BigInt(Date.now()+1000)*1000000n));
   return lines.some(([,line])=>{const entry=JSON.parse(line);return entry.requestId===requestId&&entry.traceId===traceId&&entry.status===500;});
  },{timeout:45000,interval:1000}).toBe(true);
  const tempo=new TempoClient('http://127.0.0.1:3200');
  await expect.poll(async()=>{
   const traces=await tempo.search('{resource.service.name="workload"}',Math.floor(start/1000)-5,Math.ceil(Date.now()/1000)+5) as {traceID:string}[];
   return traces.some(trace=>trace.traceID===traceId);
  },{timeout:45000,interval:1000}).toBe(true);
  const trace=await fetch(`http://127.0.0.1:3200/api/traces/${traceId}`,{signal:AbortSignal.timeout(5000)});
  expect(trace.status).toBe(200);
  expect((await trace.text()).length).toBeGreaterThan(100);
 },150000);
});
