import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
import { createActivities } from './activities';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('read-worker persistence', () => {
 const db = new SentinelDatabase(url!); const activities = createActivities(db);
 const input = {workspaceId:randomUUID(),incidentId:randomUUID(),serviceId:randomUUID()};
 beforeAll(async () => {
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[input.workspaceId,'worker test']);
  await db.inWorkspace(input.workspaceId,async client=>{
   await client.query('INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,$4,$5,$6,$7)',[input.workspaceId,input.serviceId,'web','owner','123456789012','us-east-1','arn:aws:ecs:us-east-1:123456789012:service/a/b']);
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,$4,'investigating','sev1')",[input.workspaceId,input.incidentId,input.serviceId,'test']);
  });
 });
 afterAll(()=>db.close());
 it('fails closed without evidence and records an idempotent escalation',async()=>{
  expect((await activities.collectEvidence(input)).available).toBe(false);
  const result={status:'escalated' as const,summary:'Evidence unavailable'};
  await activities.recordInvestigation(input,result);
  await activities.recordInvestigation(input,result);
  const audit=await db.inWorkspace(input.workspaceId,async c=>(await c.query('SELECT action FROM audit_events')).rows);
  expect(audit.map(row=>row.action)).toEqual(['incident.investigated']);
 });
 it('persists real-shaped SLI evidence once and reuses it on retry',async()=>{
  const current={...input,incidentId:randomUUID()};
  await db.inWorkspace(input.workspaceId,async client=>{
   await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'SLI test','investigating','sev1')",[current.workspaceId,current.incidentId,current.serviceId]);
   await client.query('INSERT INTO service_slos(workspace_id,service_id,availability_target,latency_target_ms,good_query,total_query,latency_query) VALUES($1,$2,.999,300,$3,$4,$5)',[current.workspaceId,current.serviceId,'good[{window}]','total[{window}]','latency']);
  });
  vi.stubEnv('PROMETHEUS_URL','https://metrics.example');
  vi.stubEnv('SENTINEL_CONFIG_WORKSPACE_ID',current.workspaceId);
  const fetcher=vi.fn(async(url:URL)=>new Response(JSON.stringify({status:'success',data:{resultType:'vector',result:[{metric:{},value:[Date.now()/1000,url.searchParams.get('query')?.startsWith('good')?'980':url.searchParams.get('query')?.startsWith('total')?'1000':'150']}]}})));
  vi.stubGlobal('fetch',fetcher);
  try {
   vi.stubEnv('SENTINEL_CONFIG_WORKSPACE_ID',randomUUID());
   expect((await activities.collectEvidence(current)).available).toBe(false);
   expect(fetcher).not.toHaveBeenCalled();
   vi.stubEnv('SENTINEL_CONFIG_WORKSPACE_ID',current.workspaceId);
   expect((await activities.collectEvidence(current)).summary).toContain('sev1');
   expect((await activities.collectEvidence(current)).summary).toContain('sev1');
   expect(fetcher).toHaveBeenCalledTimes(9);
   const evidence=await db.inWorkspace(current.workspaceId,async client=>(await client.query('SELECT severity FROM incident_evidence WHERE incident_id=$1',[current.incidentId])).rows);
   expect(evidence).toEqual([{severity:'sev1'}]);
  } finally {vi.unstubAllGlobals();vi.unstubAllEnvs();}
 });

});
