import { createServer } from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { NotificationRepository } from '@sentinel/db/notifications';
import { SecretVault } from '@sentinel/connectors/secrets';
import { CommunicationProcessor } from './processor';
for(const lostResponse of [false,true])it.skipIf(!process.env.TEST_DATABASE_URL)(lostResponse?'preserves unknown delivery after a lost response without publishing twice':'records intent before publishing and persists independently confirmed ntfy receipt',async()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),vault=new SecretVault(randomBytes(32)),repository=new NotificationRepository(db,vault),connections=new ConnectorRepository(db,vault);
 const workspace=randomUUID(),service=randomUUID();let message='',writes=0,intentBeforeSend=false;
 const server=createServer(async(request,response)=>{
  if(request.method==='POST'){
   writes++;intentBeforeSend=(await repository.history(workspace))[0]?.status==='sending';
   if(lostResponse){request.socket.destroy();return;}
   request.on('data',chunk=>{message+=chunk;});request.on('end',()=>response.end(JSON.stringify({id:'receipt123'})));
  }else response.end(JSON.stringify({id:'receipt123',event:'message',message})+'\n');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const endpoint=`http://127.0.0.1:${address.port}`;vi.stubEnv('SENTINEL_CONNECTOR_ALLOWED_ORIGINS',endpoint);
 try{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspace,'Communication processor']);
  await db.inWorkspace(workspace,c=>c.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'web','test','000000000000','local','fixture')",[workspace,service]));
  const connector=await connections.create(workspace,'test',{provider:'ntfy',name:'Fixture topic',mode:'live',config:{endpoint,topic:'sentinel-test-topic'}},{token:'private-test-token'});
  const subscription=await repository.subscribe(workspace,'test',{serviceId:service,connectorId:connector.id,expectedVersion:1,destinationLabel:'Fixture only',approvedTestDestination:true});
  await repository.queueTest(workspace,'test',subscription.id);
  const scan={pool:{query:async()=>({rows:[{id:workspace}]})}} as unknown as SentinelDatabase;
  const processor=new CommunicationProcessor(scan,repository);await processor.tick();await processor.tick();
  expect(intentBeforeSend).toBe(true);expect(writes).toBe(1);expect((await repository.history(workspace))[0].status).toBe(lostResponse?'unknown':'confirmed');
 }finally{vi.unstubAllEnvs();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();}
});
