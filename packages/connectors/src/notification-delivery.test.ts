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
