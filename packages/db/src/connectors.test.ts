import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SentinelDatabase } from './index';
import { ConnectorRepository } from './repositories/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';

describe.skipIf(!process.env.TEST_DATABASE_URL)('workspace connector persistence',()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 const repo=new ConnectorRepository(db,new SecretVault(randomBytes(32)));
 const workspace=randomUUID(),other=randomUUID(),service=randomUUID();
 const tenants=[workspace,other];
 beforeAll(async()=>{
  for(const id of [workspace,other])await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[id,'Connector test']);
  await db.inWorkspace(workspace,async client=>{await client.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'checkout','test','000000000000','local','fictional')",[workspace,service]);});
 });
 afterAll(async()=>{
  for(const tenant of tenants)await db.inWorkspace(tenant,client=>client.query("UPDATE connector_tests SET status='failed',finished_at=now(),result=$1 WHERE status IN ('queued','running')",[{outcome:'not-configured',capability:'test-fixture',recordCount:0}]));
  await db.close();
 });
 it('stores only encrypted credentials and refuses cross-workspace resolution',async()=>{
  const connector=await repo.create(workspace,'test',{provider:'loki',name:'Checkout logs',mode:'live',config:{endpoint:'http://loki:3100'}},{token:'private-provider-token'});
  expect(JSON.stringify(connector)).not.toContain('private-provider-token');expect(connector.hasSecret).toBe(true);
  expect(await repo.get(other,connector.id)).toBeNull();
  expect(await repo.resolve(other,service,'loki')).toBeNull();
  await repo.bind(workspace,'test',service,'loki',connector.id,connector.configVersion,{query:'{service_name="checkout"}'});
  const resolved=await repo.resolve(workspace,service,'loki');
  expect(resolved?.secret.token).toBe('private-provider-token');
  const stored=await db.inWorkspace(workspace,async c=>(await c.query('SELECT secret_envelope FROM connector_instances WHERE id=$1',[connector.id])).rows[0]);
  expect(JSON.stringify(stored)).not.toContain('private-provider-token');
  await expect(repo.bind(other,'test',service,'loki',connector.id,1,{query:'{job="other"}'})).rejects.toThrow();
 });
 it('rejects stale edits and pins a new configuration version on changes',async()=>{
  const connector=await repo.create(workspace,'test',{provider:'tempo',name:'Traces',mode:'live',config:{endpoint:'http://tempo:3200'}},{});
  const updated=await repo.update(workspace,'test',connector.id,1,{provider:'tempo',name:'Updated traces',mode:'off',config:{endpoint:'http://tempo:3200'}});
  expect(updated.configVersion).toBe(2);
  await expect(repo.update(workspace,'test',connector.id,1,{provider:'tempo',name:'Stale',mode:'live',config:{endpoint:'http://tempo:3200'}})).rejects.toThrow('version');
  await expect(repo.update(other,'test',connector.id,2,{provider:'tempo',name:'Intrusion',mode:'off',config:{endpoint:'http://tempo:3200'}})).rejects.toThrow();
 });
 it('persists a failed test when a credential key cannot decrypt, rather than endlessly requeuing',async()=>{
  const connector=await repo.create(other,'test',{provider:'github',name:'GitHub',mode:'live',config:{}},{token:'credential'});
  const queued=await repo.queueTest(other,'test',connector.id);
  const wrongKey=new ConnectorRepository(db,new SecretVault(randomBytes(32)));
  expect(await wrongKey.claimTest(other)).toBeNull();
  expect(await repo.getTest(other,connector.id,queued.id)).toMatchObject({status:'failed',result:{errorCode:'credential-unavailable'}});
 });
 it('does not execute a queued snapshot after its connector is disabled',async()=>{
  const connector=await repo.create(other,'test',{provider:'loki',name:'Logs',mode:'live',config:{endpoint:'http://loki:3100'}},{});
  await repo.queueTest(other,'test',connector.id);
  await repo.update(other,'test',connector.id,1,{provider:'loki',name:'Logs',mode:'off',config:{endpoint:'http://loki:3100'}});
  expect((await repo.claimTest(other))?.mode).toBe('off');
 });
 it('clears an unreadable stored credential when its endpoint origin changes',async()=>{
  const draft={provider:'loki' as const,name:'Logs',mode:'live' as const,config:{endpoint:'https://logs.example'}};
  const connector=await repo.create(workspace,'test',draft,{token:'hidden-provider-token'});
  const edited=await repo.update(workspace,'test',connector.id,1,{...draft,config:{endpoint:'https://another.example'}});
  expect(edited.hasSecret).toBe(false);
  await repo.bind(workspace,'test',service,'loki',connector.id,2,{query:'{job="checkout"}'});
  expect((await repo.resolve(workspace,service,'loki'))?.secret).toEqual({});
 });
 it('bounds concurrent tenant queue admission without rejecting an existing pending job',async()=>{
  const tenant=randomUUID();tenants.push(tenant);await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[tenant,'Queue capacity']);
  const connectors=await Promise.all(Array.from({length:21},(_,index)=>repo.create(tenant,'test',{provider:'loki',name:`Logs ${index}`,mode:'live',config:{endpoint:'http://loki:3100'}},{})));
  const results=await Promise.allSettled(connectors.map(connector=>repo.queueTest(tenant,'test',connector.id)));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(20);
  expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
  const successful=results.findIndex(result=>result.status==='fulfilled');
  const prior=results[successful];if(prior.status!=='fulfilled')throw new Error('No job admitted');
  expect((await repo.queueTest(tenant,'test',connectors[successful].id)).id).toBe(prior.value.id);
 });
});
