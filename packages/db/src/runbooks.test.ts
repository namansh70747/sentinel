import { randomUUID } from 'node:crypto';
import { afterAll,describe,expect,it } from 'vitest';
import { SentinelDatabase } from './index';
import { RunbookRepository } from './repositories/runbooks';

describe.skipIf(!process.env.TEST_DATABASE_URL)('versioned workspace runbooks',()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),repository=new RunbookRepository(db);
 afterAll(()=>db.close());
 it('imports idempotently, searches service-linked text and preserves immutable previous versions',async()=>{
  const workspace=randomUUID(),other=randomUUID(),service=randomUUID(),foreign=randomUUID();
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2),($3,$4)',[workspace,'Runbooks',other,'Other runbooks']);
  for(const [tenant,id]of [[workspace,service],[other,foreign]])await db.inWorkspace(tenant,c=>c.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'checkout','test','000000000000','local','fixture')",[tenant,id]));
  const input={slug:'checkout-latency',title:'Checkout latency',sourcePath:'runbooks/checkout.md',markdown:'# Checkout latency\nInspect histogram saturation before changing anything.',serviceIds:[service],expectedVersion:0};
  const first=await repository.import(workspace,'test',input);expect(first.version).toBe(1);
  expect(await repository.import(workspace,'test',input)).toEqual({...first,unchanged:true});
  expect((await repository.import(workspace,'test',{...input,expectedVersion:1})).version).toBe(1);
  expect((await repository.search(workspace,'histogram',service)).items).toHaveLength(1);
  expect((await repository.search(other,'histogram')).items).toHaveLength(0);
  expect(await repository.get(other,first.id)).toBeNull();
  await expect(repository.import(workspace,'test',{...input,serviceIds:[foreign],expectedVersion:1})).rejects.toThrow('service');
  const second=await repository.import(workspace,'test',{...input,markdown:'# Recovery\nVerify the queue drained.',expectedVersion:1});expect(second.version).toBe(2);
  expect((await repository.get(workspace,first.id,1))?.markdown).toBe(input.markdown);
  expect((await repository.search(workspace,'histogram')).items).toHaveLength(0);
  expect((await repository.search(workspace,'queue')).items).toHaveLength(1);
  await expect(repository.import(workspace,'test',{...input,expectedVersion:1})).rejects.toThrow('changed');
  await expect(db.inWorkspace(workspace,c=>c.query('UPDATE runbook_versions SET markdown=$1 WHERE runbook_id=$2',['modified',first.id]))).rejects.toThrow();
  await expect(repository.import(workspace,'test',{...input,slug:'../escape',expectedVersion:0})).rejects.toThrow();
  await expect(repository.import(workspace,'test',{...input,sourcePath:'../../secret.md',expectedVersion:0})).rejects.toThrow();
  await expect(repository.import(workspace,'test',{...input,markdown:'x'.repeat(262145)})).rejects.toThrow();
 });
});
