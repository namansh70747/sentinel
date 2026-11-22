import { createServer } from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';
import { ConnectorTestRunner } from './connector-tests';

it.skipIf(!process.env.TEST_DATABASE_URL)('executes a queued capability against a real HTTP provider and persists only redacted metadata',async()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 const workspace=randomUUID(),token='private-capability-token';let authorized=false;
 const server=createServer((request,response)=>{authorized=request.headers.authorization===`Bearer ${token}`;response.setHeader('content-type','application/json');response.end(JSON.stringify({status:'success',data:['checkout']}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('No test port');const endpoint=`http://127.0.0.1:${address.port}`;
 vi.stubEnv('SENTINEL_CONNECTOR_ALLOWED_ORIGINS',endpoint);
 try{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspace,'Queued capability']);
  const repository=new ConnectorRepository(db,new SecretVault(randomBytes(32)));
  const connector=await repository.create(workspace,'test',{provider:'loki',name:'Bounded logs',mode:'live',config:{endpoint}},{token});
  const job=await repository.queueTest(workspace,'test',connector.id);
  expect((await repository.queueTest(workspace,'test',connector.id)).id).toBe(job.id);
  // Pin this runner's scan to the isolated test workspace; prior integration
  // fixtures may contain queued jobs encrypted under their own ephemeral keys.
  const scan={pool:{query:async()=>({rows:[{id:workspace}]})}} as unknown as SentinelDatabase;
  await new ConnectorTestRunner(scan,repository).tick();
  const result=await repository.getTest(workspace,connector.id,job.id);
  expect(authorized).toBe(true);expect(result).toMatchObject({status:'succeeded',result:{outcome:'verified-read',capability:'logs.labels',recordCount:1}});
  expect(JSON.stringify(result)).not.toContain(token);
  expect(await repository.claimTest(workspace)).toBeNull();
 }finally{vi.unstubAllEnvs();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();}
});
