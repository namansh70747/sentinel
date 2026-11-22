import { createServer } from 'node:http';
import { expect,it } from 'vitest';
import { ConnectorHttpClient } from './http';
import { collectBoundLogs,collectBoundTraces,collectBoundMetrics } from './bound-telemetry';

it('uses each service mapping and authenticated tenant headers for logs and trace details',async()=>{
 const queries:string[]=[];let authenticated=true;
 const server=createServer((request,response)=>{
  authenticated&&=request.headers.authorization==='Bearer private-token'&&request.headers['x-scope-orgid']==='tenant-a';
  const url=new URL(request.url!,'http://local');queries.push(url.searchParams.get('query')??url.searchParams.get('q')??url.pathname);
  response.setHeader('content-type','application/json');
  response.end(JSON.stringify(url.pathname.includes('query_range')?{status:'success',data:{resultType:'streams',result:[{values:[[String(BigInt(Date.now()-1000)*1000000n),'request failed trace_id=0123456789abcdef0123456789abcdef']]}]}}:url.pathname==='/api/search'?{traces:[{traceID:'0123456789abcdef0123456789abcdef'}]}:{batches:[]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const endpoint=`http://127.0.0.1:${address.port}`;
 const http=new ConnectorHttpClient({allowedPrivateOrigins:[endpoint]});
 const base={config:{endpoint,tenantId:'tenant-a'},secret:{token:'private-token'}};
 try{
  const logs=await collectBoundLogs({...base,mapping:{query:'{service_name="checkout"}'}},http);
  expect(logs.lines).toHaveLength(1);expect(logs.traceIds).toEqual(['0123456789abcdef0123456789abcdef']);
  const traces=await collectBoundTraces({...base,mapping:{serviceName:'checkout'}},http);
  expect(traces.traces).toHaveLength(1);expect(queries).toContain('{service_name="checkout"}');expect(queries).toContain('{resource.service.name="checkout"}');expect(queries).toContain('/api/traces/0123456789abcdef0123456789abcdef');expect(authenticated).toBe(true);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('qualifies coverage from each raw SLI input, independently of exporter uptime',async()=>{
 const now=Math.floor(Date.now()/15000)*15000,queries:string[]=[];
 const server=createServer((request,response)=>{
  const query=new URL(request.url!,'http://local').searchParams.get('query')!;queries.push(query);
  const coverage=query.includes('_raw[6h]');
  const result=coverage?(query.startsWith('latency_raw')?[]:[{metric:{service:'checkout'},values:Array.from({length:1441},(_,i)=>[now/1000-21600+i*15,String(50+i)])}]):[{metric:{service:'checkout'},value:[now/1000,query==='latency'?'20':'1000']}];
  response.setHeader('content-type','application/json');response.end(JSON.stringify({status:'success',data:{resultType:coverage?'matrix':'vector',result}}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const endpoint=`http://127.0.0.1:${address.port}`;
 try{
  const metrics=await collectBoundMetrics({config:{endpoint},secret:{},mapping:{goodQuery:'good[{window}]',totalQuery:'total[{window}]',latencyQuery:'latency',goodCoverageQuery:'good_raw[6h]',totalCoverageQuery:'total_raw[6h]',latencyCoverageQuery:'latency_raw[6h]',scrapeIntervalSeconds:15}},{availabilityTarget:.999,latencyTargetMs:300},new ConnectorHttpClient({allowedPrivateOrigins:[endpoint]}),now);
  expect(metrics.coverage.every(window=>window.inputs.find(row=>row.input==='goodCoverageQuery')?.covered)).toBe(true);
  expect(metrics.coverage.every(window=>window.inputs.find(row=>row.input==='latencyCoverageQuery')?.covered)).toBe(false);
  expect(queries.some(query=>query.includes('up{'))).toBe(false);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
