import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,describe,expect,it } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import { SentinelDatabase } from '@sentinel/db';
import { createActivities } from './activities';
import { dispatchOne } from './dispatch';
describe.skipIf(process.env.TEST_TEMPORAL!=='true'||!process.env.TEST_DATABASE_URL)('durable investigation dispatch',()=>{
 let env:TestWorkflowEnvironment;
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 beforeAll(async()=>{env=await TestWorkflowEnvironment.createTimeSkipping();},120000);
 afterAll(async()=>{if(env)await env.teardown();await db.close();});
 it('dispatches an outbox job and persists the real workflow outcome',async()=>{
  const workspaceId=randomUUID(),serviceId=randomUUID(),incidentId=randomUUID();
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspaceId,'Durable integration']);
  await db.inWorkspace(workspaceId,async client=>{
   await client.query('INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,serviceId,'web','platform','123456789012','us-east-1','arn:aws:ecs:us-east-1:123456789012:service/test/web']);
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Investigation','investigating','sev4')",[workspaceId,incidentId,serviceId]);
   await client.query('INSERT INTO investigation_jobs(workspace_id,incident_id,service_id) VALUES($1,$2,$3)',[workspaceId,incidentId,serviceId]);
  });
  const worker=await Worker.create({connection:env.nativeConnection,taskQueue:'sentinel-read',workflowsPath:fileURLToPath(new URL('../../../packages/workflows/src/index.ts',import.meta.url)),activities:createActivities(db)});
  await worker.runUntil(async()=>{
   expect(await dispatchOne(db,env.client,workspaceId)).toBe(true);
   const result=await env.client.workflow.getHandle(`investigation-${workspaceId}-${incidentId}`).result();
   expect(result.status).toBe('escalated');
   await db.pool.query('UPDATE investigation_jobs SET dispatched_at=NULL WHERE incident_id=$1',[incidentId]);
   expect(await dispatchOne(db,env.client,workspaceId)).toBe(true);
  });
  const state=await db.inWorkspace(workspaceId,async client=>(await client.query('SELECT state FROM incidents WHERE id=$1',[incidentId])).rows[0].state);
  expect(state).toBe('escalated');
  const job=await db.pool.query('SELECT dispatched_at FROM investigation_jobs WHERE incident_id=$1',[incidentId]);
  expect(job.rows[0].dispatched_at).toBeTruthy();
 },120000);
});
