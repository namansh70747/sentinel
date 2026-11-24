import { randomBytes,randomUUID } from 'node:crypto';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { SentinelDatabase } from './index';
import { InvestigationRepository } from './repositories/investigations';
import { ConnectorRepository } from './repositories/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';
describe.skipIf(!process.env.TEST_DATABASE_URL)('refreshable investigations',()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),repository=new InvestigationRepository(db),connections=new ConnectorRepository(db,new SecretVault(randomBytes(32)));
 const workspace=randomUUID(),other=randomUUID(),service=randomUUID(),incident=randomUUID();
 beforeAll(async()=>{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2),($3,$4)',[workspace,'Refresh',other,'Other']);
  await db.inWorkspace(workspace,async client=>{
   await client.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'checkout','owner','000000000000','local','fictional')",[workspace,service]);
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Existing incident','recovered','sev3')",[workspace,incident,service]);
  });
 });
 afterAll(()=>db.close());
 it('freezes service binding versions, reuses persisted attempts on retry and creates distinct refresh runs',async()=>{
  const connector=await connections.create(workspace,'test',{provider:'loki',name:'Logs',mode:'live',config:{endpoint:'http://loki:3100'}},{});
  await connections.bind(workspace,'test',service,'loki',connector.id,1,{query:'{service_name="checkout"}'});
  const first=await repository.create(workspace,incident,'test');
  await connections.update(workspace,'test',connector.id,1,{provider:'loki',name:'Updated logs',mode:'live',config:{endpoint:'http://loki:3100'}});
  const second=await repository.create(workspace,incident,'test');expect(second.id).not.toBe(first.id);
  const old=await repository.get(workspace,first.id),fresh=await repository.get(workspace,second.id);
  expect(old?.attempts.find(row=>row.source==='loki')?.config_version).toBe(1);expect(fresh?.attempts.find(row=>row.source==='loki')?.config_version).toBe(2);
  const input={workspaceId:workspace,incidentId:incident,serviceId:service,runId:first.id};
  expect(await repository.persist(input,'loki','ok','live',{lines:['first']})).toBe(true);
  expect(await repository.persist(input,'loki','empty','live',{lines:[]})).toBe(false);
  const saved=await repository.get(workspace,first.id);expect(saved?.evidence).toHaveLength(1);expect(saved?.evidence[0].detail).toEqual({lines:['first']});
  await repository.finish(input,'advised','New evidence');
  const closed=await repository.get(workspace,first.id);expect(closed?.evidence).toHaveLength(8);expect(closed?.status).toBe('escalated');
  expect(closed?.advisory).toMatchObject({mode:'rules',policyVersion:1,evidenceRefs:[closed?.evidence.find(row=>row.source==='prometheus')?.attempt_id]});
  expect(await repository.persist(input,'prometheus','ok','live',{late:true})).toBe(false);
  expect((await repository.get(workspace,first.id))?.evidence.find(row=>row.source==='prometheus')?.outcome).toBe('unavailable');
  expect((await db.inWorkspace(workspace,async c=>(await c.query('SELECT state,severity FROM incidents WHERE id=$1',[incident])).rows[0]))).toEqual({state:'recovered',severity:'sev3'});
  expect(await repository.get(other,first.id)).toBeNull();
  await expect(repository.create(other,incident,'outsider')).rejects.toThrow('not found');
  await expect(repository.persist({...input,workspaceId:other},'loki','ok','live',{})).rejects.toThrow();
 });
});
