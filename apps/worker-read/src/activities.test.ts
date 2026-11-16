import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MOCK_SERVICE_ARN } from '@sentinel/connectors';
import { SentinelDatabase } from '@sentinel/db';
import { createActivities } from './activities';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('read-worker persistence', () => {
 const db = new SentinelDatabase(url!); const activities = createActivities(db);
 const input = {workspaceId:randomUUID(),incidentId:randomUUID(),serviceId:randomUUID()};
 beforeAll(async () => {
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[input.workspaceId,'worker test']);
  await db.inWorkspace(input.workspaceId,async client=>{
   await client.query('INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,$4,$5,$6,$7)',[input.workspaceId,input.serviceId,'web','owner','000000000000','ap-south-1',MOCK_SERVICE_ARN]);
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,$4,'investigating','sev4')",[input.workspaceId,input.incidentId,input.serviceId,'test']);
  });
 });
 afterAll(()=>db.close());
 it('records a missing prometheus sample and an idempotent escalation',async()=>{
  expect((await activities.collectPrometheus(input)).outcome).toBe('not-configured');
  const result={status:'escalated' as const,summary:'Telemetry is not configured.'};
  await activities.recordInvestigation(input,result);
  await activities.recordInvestigation(input,result);
  const row=await db.inWorkspace(input.workspaceId,async c=>(await c.query('SELECT state,severity FROM incidents WHERE id=$1',[input.incidentId])).rows[0]);
  expect(row).toEqual({state:'escalated',severity:'sev4'});
 });
 it('stores prometheus severity and does not duplicate the row on retry',async()=>{
  const current={...input,incidentId:randomUUID()};
  await db.inWorkspace(input.workspaceId,async client=>{
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'SLI test','investigating','sev4')",[current.workspaceId,current.incidentId,current.serviceId]);
   await client.query('INSERT INTO service_slos(workspace_id,service_id,availability_target,latency_target_ms,good_query,total_query,latency_query) VALUES($1,$2,.999,300,$3,$4,$5)',[current.workspaceId,current.serviceId,'good[{window}]','total[{window}]','latency']);
  });
  vi.stubEnv('PROMETHEUS_URL','http://127.0.0.1:9090');
  vi.stubEnv('SENTINEL_EGRESS_ALLOWLIST','127.0.0.1');
  vi.stubEnv('SENTINEL_CONFIG_WORKSPACE_ID',current.workspaceId);
  vi.stubEnv('SENTINEL_ECS_MODE','simulated');
  const fetcher=vi.fn(async(url:URL)=>new Response(JSON.stringify({status:'success',data:{resultType:'vector',result:[{metric:{},value:[Date.now()/1000,url.searchParams.get('query')?.startsWith('good')?'980':url.searchParams.get('query')?.startsWith('total')?'1000':'20']}]}})));
  vi.stubGlobal('fetch',fetcher);
  try {
   const first=await activities.collectPrometheus(current);
   expect(first.summary).toContain('sev1');
   expect(first.outcome).toBe('uncovered');
   await activities.collectPrometheus(current);
   await activities.collectEcs(current);
   const evidence=await db.inWorkspace(current.workspaceId,async client=>(await client.query('SELECT source,severity,provenance,window_covered FROM incident_evidence WHERE incident_id=$1 ORDER BY source',[current.incidentId])).rows);
   expect(evidence).toEqual([
    {source:'ecs',severity:'sev4',provenance:'simulated',window_covered:null},
    {source:'prometheus',severity:'sev1',provenance:'live',window_covered:false},
   ]);
   const hypothesis=await db.inWorkspace(current.workspaceId,async client=>(await client.query('SELECT hypothesis FROM change_hypotheses WHERE incident_id=$1',[current.incidentId])).rows[0].hypothesis);
   expect(hypothesis.status).not.toBe('candidate');
   await activities.recordInvestigation(current,{status:'advised',summary:first.summary});
   const incident=await db.inWorkspace(current.workspaceId,async client=>(await client.query('SELECT state,severity FROM incidents WHERE id=$1',[current.incidentId])).rows[0]);
   expect(incident).toEqual({state:'advised',severity:'sev1'});
  } finally {vi.unstubAllGlobals();vi.unstubAllEnvs();}
 });
 it('records ecs as not-configured when the mode is off',async()=>{
  vi.stubEnv('SENTINEL_ECS_MODE','off');
  const current={...input,incidentId:randomUUID()};
  await db.inWorkspace(input.workspaceId,async client=>{
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'off','investigating','sev4')",[current.workspaceId,current.incidentId,current.serviceId]);
  });
  expect((await activities.collectEcs(current)).outcome).toBe('not-configured');
  vi.unstubAllEnvs();
 });
});
