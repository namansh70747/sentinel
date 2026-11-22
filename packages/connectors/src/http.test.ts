import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { ConnectorHttpClient } from './http';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));});
async function serve(handler:RequestListener){
 const server=createServer(handler);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');return `http://127.0.0.1:${address.port}`;
}
it('bounds responses and refuses redirects without leaking authentication',async()=>{
 const url=await serve((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{location:'/private'});res.end();return;}res.end('x'.repeat(100));});
 const client=new ConnectorHttpClient({allowedPrivateOrigins:[url],maxResponseBytes:32});
 await expect(client.get(url+'/redirect',{authorization:'Bearer secret-token'})).rejects.toMatchObject({code:'redirect-rejected'});
 await expect(client.get(url)).rejects.toMatchObject({code:'response-too-large'});
});
it('retries a rate-limited read but never blindly retries a write',async()=>{
 let reads=0,writes=0;
 const url=await serve((req,res)=>{if(req.method==='POST'){writes++;res.writeHead(503);res.end();return;}if(++reads===1){res.writeHead(429,{'retry-after':'0'});res.end();return;}res.setHeader('content-type','application/json');res.end('{"ok":true}');});
 const client=new ConnectorHttpClient({allowedPrivateOrigins:[url]});
 expect(await client.json(url)).toEqual({ok:true});expect(reads).toBe(2);
 await expect(client.send(url,{method:'POST',body:'test'})).rejects.toMatchObject({code:'unavailable'});expect(writes).toBe(1);
});
it('blocks private DNS resolutions unless the exact origin is approved',async()=>{
 const client=new ConnectorHttpClient({resolve:async()=>[{address:'127.0.0.1',family:4}]});
 await expect(client.get('https://attacker.example')).rejects.toMatchObject({code:'endpoint-rejected'});
 await expect(client.get('http://user:secret@127.0.0.1')).rejects.toMatchObject({code:'endpoint-rejected'});
});
it('returns generic denied/invalid-response errors without provider response contents',async()=>{
 const url=await serve((req,res)=>{if(req.url==='/denied')res.writeHead(401);else res.setHeader('content-type','application/json');res.end('secret-provider-token');});
 const client=new ConnectorHttpClient({allowedPrivateOrigins:[url]});
 await expect(client.get(url+'/denied')).rejects.toMatchObject({code:'denied'});
 await expect(client.json(url)).rejects.toMatchObject({code:'invalid-response'});
});
it('bounds DNS resolution and does not retry permanent HTTP failures',async()=>{
 const stalled=new ConnectorHttpClient({timeoutMs:20,resolve:()=>new Promise(()=>{})});
 await expect(stalled.get('https://unreachable.example')).rejects.toMatchObject({code:'unavailable'});
 let calls=0;
 const url=await serve((_req,res)=>{calls++;res.writeHead(404);res.end('private details');});
 await expect(new ConnectorHttpClient({allowedPrivateOrigins:[url]}).get(url)).rejects.toMatchObject({status:404});
 expect(calls).toBe(1);
});
it('shares a collection deadline across sequential reads',async()=>{
 const url=await serve((_req,res)=>res.end('{}'));
 const client=new ConnectorHttpClient({allowedPrivateOrigins:[url],deadlineAt:Date.now()-1});
 await expect(client.get(url)).rejects.toMatchObject({code:'unavailable'});
});
it('canonicalizes approved origins before comparing normalized provider URLs',async()=>{
 const url=await serve((_req,response)=>response.end('{"ok":true}'));
 const client=new ConnectorHttpClient({allowedPrivateOrigins:[url+'/']});
 expect(await client.json(url)).toEqual({ok:true});
});
