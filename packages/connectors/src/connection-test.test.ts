import { createServer } from 'node:http';
import { expect,it } from 'vitest';
import { ConnectorHttpClient } from './http';
import { testConnection } from './connection-test';
it('distinguishes actual records, empty reads, denied credentials and disabled connectors',async()=>{
 let requests=0;
 const server=createServer((req,res)=>{requests++;res.setHeader('content-type','application/json');if(req.headers.authorization==='Bearer denied'){res.writeHead(401);res.end();return;}res.end(JSON.stringify({status:'success',data:{result:req.headers['x-scope-orgid']==='empty'?[]:[{metric:{job:'checkout'},value:[Date.now()/1000,'1']}]}}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();if(!address||typeof address==='string')throw new Error('No port');const endpoint=`http://127.0.0.1:${address.port}`,http=new ConnectorHttpClient({allowedPrivateOrigins:[endpoint]});
  const input={provider:'prometheus' as const,mode:'live',config:{endpoint},secret:{token:'valid'}};
  expect(await testConnection(input,http)).toMatchObject({outcome:'verified-read',capability:'metrics.query',recordCount:1});
  expect(await testConnection({...input,config:{endpoint,tenantId:'empty'}},http)).toMatchObject({outcome:'empty',recordCount:0});
  expect(await testConnection({...input,secret:{token:'denied'}},http)).toMatchObject({outcome:'denied',recordCount:0});
  const before=requests;expect(await testConnection({...input,mode:'off'},http)).toMatchObject({outcome:'not-configured'});expect(requests).toBe(before);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
