import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import { investigateIncident } from './index';
import type { SourceResult } from '@sentinel/contracts';

const skip = async (): Promise<SourceResult> => ({ source: 'ecs', outcome: 'not-configured', provenance: null, summary: 'skipped' });
describe.skipIf(process.env.TEST_TEMPORAL !== 'true')('durable read-only investigation', () => {
 let env: TestWorkflowEnvironment;
 beforeAll(async () => { env = await TestWorkflowEnvironment.createTimeSkipping(); }, 120000);
 afterAll(async () => { if (env) await env.teardown(); });
 it('adds Kubernetes only for explicitly opted-in fresh runs and replays both input histories',async()=>{
  let calls=0;const workflowsPath=fileURLToPath(new URL('./index.ts',import.meta.url)),taskQueue='sentinel-kubernetes-opt-in';
  const worker=await Worker.create({connection:env.nativeConnection,taskQueue,workflowsPath,activities:{
   collectPrometheus:async()=>({source:'prometheus',outcome:'ok',provenance:'live',summary:'metrics available'}),collectEcs:skip,collectLoki:skip,collectTempo:skip,collectGithub:skip,collectCloudwatch:skip,collectCost:skip,collectDr:skip,
   collectKubernetes:async()=>{calls++;return {source:'kubernetes',outcome:'ok',provenance:'live',summary:'Namespace context recorded'};},recordInvestigation:async()=>{},recordSourceFailure:async()=>{},notifyNtfy:async()=>{},
  }});
  await worker.runUntil((async()=>{for(const enabled of [false,true]){
   const workflowId='kubernetes-opt-in-'+String(enabled),input={workspaceId:'workspace',incidentId:'incident',serviceId:'service',...(enabled?{extraSources:['kubernetes' as const]}:{})};
   await env.client.workflow.execute(investigateIncident,{taskQueue,workflowId,args:[input]});expect(calls).toBe(enabled?1:0);
  }})());
  for(const enabled of [false,true])await Worker.runReplayHistory({workflowsPath},await env.client.workflow.getHandle('kubernetes-opt-in-'+String(enabled)).fetchHistory());
 },120000);
 it('stores the prometheus error text and still asks for the other sources', async () => {
  const recorded: unknown[] = [];
  const calls: string[] = [];
  const worker = await Worker.create({ connection:env.nativeConnection, taskQueue:'sentinel-test', workflowsPath:fileURLToPath(new URL('./index.ts',import.meta.url)), activities:{
   collectPrometheus: async () => { throw new Error('prometheus down'); },
   collectEcs: async () => { calls.push('ecs'); return skip(); },
   collectLoki: async () => skip(), collectTempo: async () => skip(), collectGithub: async () => skip(),
   collectCloudwatch: async () => skip(), collectCost: async () => skip(), collectDr: async () => skip(),
   recordInvestigation: async (...args: unknown[]) => { recorded.push(args); },
   recordSourceFailure: async () => {},
   notifyNtfy: async () => {},
  } });
  const input={workspaceId:'workspace',incidentId:'incident',serviceId:'service'};
  const result=await worker.runUntil(env.client.workflow.execute(investigateIncident,{ taskQueue:'sentinel-test',workflowId:'test-missing-evidence',args:[input] }));
  expect(result.status).toBe('escalated');
  expect(result.summary).toContain('prometheus down');
  expect(calls).toEqual(['ecs']);
  expect(recorded).toHaveLength(1);
 },120000);
 it('finishes and records an investigation when an optional collector fails', async () => {
  const recorded: unknown[] = [], calls: string[] = [], failures: string[] = [];
  let ecsAttempts = 0;
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue:'sentinel-optional-test', workflowsPath:fileURLToPath(new URL('./index.ts',import.meta.url)), activities:{
   collectPrometheus: async () => ({source:'prometheus',outcome:'ok',provenance:'live',summary:'metrics available'}),
   collectEcs: async () => { ecsAttempts += 1; throw new Error('ECS unavailable'); },
   collectLoki: async () => { calls.push('loki'); return skip(); },
   collectTempo: async () => skip(), collectGithub: async () => skip(), collectCloudwatch: async () => { calls.push(`cloudwatch-after-${ecsAttempts}`); return skip(); }, collectCost: async () => skip(), collectDr: async () => skip(),
   recordInvestigation: async (...args: unknown[]) => { recorded.push(args); }, recordSourceFailure: async (_input: unknown, source: string) => { failures.push(source); }, notifyNtfy: async () => {},
  } });
  const result = await worker.runUntil(env.client.workflow.execute(investigateIncident,{taskQueue:'sentinel-optional-test',workflowId:'test-optional-failure',args:[{workspaceId:'workspace',incidentId:'incident',serviceId:'service'}]}));
  expect(result.status).toBe('advised');
  expect(calls).toEqual(['loki', 'cloudwatch-after-3']);
  expect(failures).toEqual(['ecs']);
  expect(recorded).toHaveLength(1);
 },120000);
 it('runs optional collectors with a maximum concurrency of four', async () => {
  let active = 0, maximumActive = 0;
  const collect = async (): Promise<SourceResult> => {
   active += 1;
   maximumActive = Math.max(maximumActive, active);
   await new Promise(resolve => setTimeout(resolve, 25));
   active -= 1;
   return skip();
  };
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue:'sentinel-concurrency-test', workflowsPath:fileURLToPath(new URL('./index.ts',import.meta.url)), activities:{
   collectPrometheus: async () => ({source:'prometheus',outcome:'ok',provenance:'live',summary:'metrics available'}),
   collectEcs: collect, collectLoki: collect, collectTempo: collect, collectGithub: collect,
   collectCloudwatch: collect, collectCost: collect, collectDr: collect,
   recordInvestigation: async () => {}, recordSourceFailure: async () => {}, notifyNtfy: async () => {},
  } });
  await worker.runUntil(env.client.workflow.execute(investigateIncident,{taskQueue:'sentinel-concurrency-test',workflowId:'test-bounded-concurrency',args:[{workspaceId:'workspace',incidentId:'incident',serviceId:'service'}]}));
  expect(maximumActive).toBe(4);
 },120000);
 it('does not fail a persisted investigation when notification delivery fails', async () => {
  const recorded: unknown[] = [];
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue:'sentinel-notification-test', workflowsPath:fileURLToPath(new URL('./index.ts',import.meta.url)), activities:{
   collectPrometheus: async () => ({source:'prometheus',outcome:'ok',provenance:'live',summary:'metrics available'}),
   collectEcs: skip, collectLoki: skip, collectTempo: skip, collectGithub: skip,
   collectCloudwatch: skip, collectCost: skip, collectDr: skip,
   recordInvestigation: async (...args: unknown[]) => { recorded.push(args); }, recordSourceFailure: async () => {},
   notifyNtfy: async () => { throw new Error('ntfy unavailable'); },
  } });
  const result = await worker.runUntil(env.client.workflow.execute(investigateIncident,{taskQueue:'sentinel-notification-test',workflowId:'test-notification-failure',args:[{workspaceId:'workspace',incidentId:'incident',serviceId:'service'}]}));
  expect(result.status).toBe('advised');
  expect(recorded).toHaveLength(1);
 },120000);
});
