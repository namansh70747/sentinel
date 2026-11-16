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
 it('stores the prometheus error text and still asks for the other sources', async () => {
  const recorded: unknown[] = [];
  const calls: string[] = [];
  const worker = await Worker.create({ connection:env.nativeConnection, taskQueue:'sentinel-test', workflowsPath:fileURLToPath(new URL('./index.ts',import.meta.url)), activities:{
   collectPrometheus: async () => { throw new Error('prometheus down'); },
   collectEcs: async () => { calls.push('ecs'); return skip(); },
   collectLoki: async () => skip(), collectTempo: async () => skip(), collectGithub: async () => skip(),
   collectCloudwatch: async () => skip(), collectCost: async () => skip(), collectDr: async () => skip(),
   recordInvestigation: async (...args: unknown[]) => { recorded.push(args); },
   notifyNtfy: async () => {},
  } });
  const input={workspaceId:'workspace',incidentId:'incident',serviceId:'service'};
  const result=await worker.runUntil(env.client.workflow.execute(investigateIncident,{ taskQueue:'sentinel-test',workflowId:'test-missing-evidence',args:[input] }));
  expect(result.status).toBe('escalated');
  expect(result.summary).toContain('prometheus down');
  expect(calls).toEqual(['ecs']);
  expect(recorded).toHaveLength(1);
 },120000);
});
