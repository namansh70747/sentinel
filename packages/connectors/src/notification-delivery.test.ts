import { createServer } from 'node:http';
import { expect,it } from 'vitest';
import { ConnectorHttpClient } from './http';
import { deliverNotification } from './notification-delivery';
it('confirms ntfy through actual subscription receipt and does not retry uncertain writes',async()=>{
 let writes=0,message='';
 const server=createServer((request,response)=>{
  if(request.headers.authorization!=='Bearer private-test-token'){response.writeHead(401);response.end();return;}
  if(request.method==='POST'){writes++;request.on('data',chunk=>{message+=chunk;});request.on('end',()=>{response.end(JSON.stringify({id:'message123'}));});}
  else response.end(JSON.stringify({id:'message123',event:'message',message})+'\n');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const endpoint=`http://127.0.0.1:${address.port}`;
 try{
  const result=await deliverNotification({provider:'ntfy',config:{endpoint,topic:'sentinel-test-topic'},secret:{token:'private-test-token'},message:'Approved integration test'},new ConnectorHttpClient({allowedPrivateOrigins:[endpoint]}));
  expect(result).toEqual({status:'confirmed',messageId:'message123'});expect(writes).toBe(1);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('records an unknown result after a lost publish response and never sends it twice',async()=>{
 let writes=0;const server=createServer((request)=>{writes++;request.socket.destroy();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const endpoint=`http://127.0.0.1:${address.port}`;
 try{expect(await deliverNotification({provider:'ntfy',config:{endpoint,topic:'sentinel-test-topic'},secret:{token:'private-test-token'},message:'Approved test'},new ConnectorHttpClient({allowedPrivateOrigins:[endpoint]}))).toMatchObject({status:'unknown'});expect(writes).toBe(1);}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

import assert from 'node:assert/strict';

it('Slack sends a readable incident card with a plain-text fallback', async () => {
 const http = new ConnectorHttpClient();
 let payload: Record<string, unknown> = {};
 http.send = async (_url, options) => {
  payload = JSON.parse(String(options?.body));
  return {text: 'ok', status: 200, headers: {}};
 };
 const result = await deliverNotification({
  provider: 'slack',
  config: {},
  secret: {webhookUrl: 'https://hooks.slack.com/services/T/B/token'},
  message: 'Legacy UUID-heavy message',
  incident: {title: 'Checkout latency increased', service: 'checkout-api', severity: 'sev2', status: 'escalated', evidence: [{source:'ecs',outcome:'ok',provenance:'live'},{source:'cloudwatch',outcome:'ok',provenance:'live'},{source:'cloudwatch-logs',outcome:'empty',provenance:'live'},{source:'cost',outcome:'not-configured',provenance:null},{source:'dr',outcome:'not-configured',provenance:null,displayStatus:'Not applicable'},{source:'tempo',outcome:'ok',provenance:'simulated'}]},
 }, http);
 assert.equal(result.status, 'sent');
 assert.match(JSON.stringify(payload.attachments), /#B45309/);
 assert.match(JSON.stringify(payload.attachments), /What Sentinel verified/);
 assert.match(String(payload.text), /checkout api.*needs attention/i);
 assert.match(JSON.stringify(payload.blocks), /Checkout latency increased/);
 assert.match(JSON.stringify(payload.blocks), /High priority/);
 assert.match(JSON.stringify(payload.attachments), /AWS service status, CPU and memory metrics/);
 assert.match(String(payload.text), /Setup needed: AWS costs\./);
 assert.match(String(payload.text), /Not applicable: backup availability/);
 assert.match(String(payload.text), /No records found: AWS application logs/);
 assert.doesNotMatch(String(payload.text), /Live checks passed:.*traces/i);
 assert.match(JSON.stringify(payload.blocks), /enough recent data for AWS application logs/);
 assert.doesNotMatch(JSON.stringify(payload), /Legacy UUID-heavy message|SEV2/);
});
