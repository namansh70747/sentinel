import { createServer } from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';
import { createActivities } from './activities';
import { InvestigationRepository } from '@sentinel/db/investigations';
it.skipIf(!process.env.TEST_DATABASE_URL)('collects separate service mappings and never falls back to global credentials',async()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),workspace=randomUUID(),queries:string[]=[];
 const server=createServer((request,response)=>{
  const query=new URL(request.url!,'http://local').searchParams.get('query')!;queries.push(query);
  if(request.headers.authorization!=='Bearer connector-read-secret'){response.writeHead(401);response.end();return;}
  response.setHeader('content-type','application/json');response.end(JSON.stringify({status:'success',data:{resultType:'streams',result:[{values:[[String(BigInt(Date.now()-1000)*1000000n),`${query} connector-read-secret`]]}]}}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const endpoint=`http://127.0.0.1:${address.port}`;
 vi.stubEnv('SENTINEL_CONNECTOR_ALLOWED_ORIGINS',endpoint);vi.stubEnv('LOKI_URL','http://global-credentials-must-not-be-used.invalid');
 try{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspace,'Service isolation']);
  const repository=new ConnectorRepository(db,new SecretVault(randomBytes(32))),activities=createActivities(db,repository);
  const connector=await repository.create(workspace,'test',{provider:'loki',name:'Logs',mode:'live',config:{endpoint}},{token:'connector-read-secret'});
  const inputs:{workspaceId:string;serviceId:string;incidentId:string}[]=[];
  for(const name of ['checkout','billing','unbound']){
   const input={workspaceId:workspace,serviceId:randomUUID(),incidentId:randomUUID()};
   inputs.push(input);
   await db.inWorkspace(workspace,async client=>{
    await client.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,'test','000000000000','local','fictional')",[workspace,input.serviceId,name]);
    await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Test','investigating','sev4')",[workspace,input.incidentId,input.serviceId]);
   });
   if(name!=='unbound')await repository.bind(workspace,'test',input.serviceId,'loki',connector.id,1,{query:`{service_name="${name}"}`});
   expect((await activities.collectLoki(input)).outcome).toBe(name==='unbound'?'not-configured':'ok');
  }
  expect(queries).toEqual(['{service_name="checkout"}','{service_name="billing"}']);
  const runs=new InvestigationRepository(db),input=inputs[0],first=await runs.create(workspace,input.incidentId,'test');
  await repository.bind(workspace,'test',input.serviceId,'loki',connector.id,1,{query:'{service_name="updated-checkout"}'});
  expect((await activities.collectLoki({...input,runId:first.id})).outcome).toBe('ok');
  expect(queries.at(-1)).toBe('{service_name="checkout"}');
  const beforeRetry=queries.length;
  expect((await activities.collectLoki({...input,runId:first.id})).outcome).toBe('ok');
  expect(queries).toHaveLength(beforeRetry);
  const fresh=await runs.create(workspace,input.incidentId,'test');
  await activities.collectLoki({...input,runId:fresh.id});expect(queries.at(-1)).toBe('{service_name="updated-checkout"}');
  const evidence=await db.inWorkspace(workspace,async client=>(await client.query('SELECT detail FROM incident_evidence')).rows);
  expect(JSON.stringify(evidence)).not.toContain('connector-read-secret');
 }finally{vi.unstubAllEnvs();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();}
});
