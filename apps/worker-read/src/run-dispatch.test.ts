import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import type { Client } from '@temporalio/client';
import { SentinelDatabase } from '@sentinel/db';
import { InvestigationRepository } from '@sentinel/db/investigations';
import { reconcileRun } from './run-dispatch';
it.skipIf(!process.env.TEST_DATABASE_URL)('reconciles terminal Temporal executions, fills missing source outcomes and releases run capacity',async()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),workspaceId=randomUUID(),serviceId=randomUUID(),incidentId=randomUUID();
 try{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspaceId,'Terminal reconciliation']);
  await db.inWorkspace(workspaceId,async client=>{
   await client.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'web','test','000000000000','local','fixture')",[workspaceId,serviceId]);
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Recovered','recovered','sev4')",[workspaceId,incidentId,serviceId]);
  });
  const repository=new InvestigationRepository(db),run=await repository.create(workspaceId,incidentId,'test');
  await db.inWorkspace(workspaceId,client=>client.query("UPDATE investigation_runs SET status='running',created_at=now()-interval '3 minutes' WHERE id=$1",[run.id]));
  const client={connection:{withDeadline:async(_deadline:number,callback:()=>Promise<unknown>)=>callback()},workflow:{getHandle:()=>({describe:async()=>({status:{name:'FAILED'}})})}} as unknown as Client;
  expect(await reconcileRun(db,client,workspaceId)).toBe(true);
  const completed=await repository.get(workspaceId,run.id);expect(completed?.status).toBe('failed');expect(completed?.evidence).toHaveLength(8);expect(completed?.evidence.every(row=>row.outcome==='unavailable')).toBe(true);
  expect(await reconcileRun(db,client,workspaceId)).toBe(false);
  expect((await repository.create(workspaceId,incidentId,'test')).id).not.toBe(run.id);
 }finally{await db.close();}
});
