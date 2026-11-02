import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import { investigateIncident } from './index';

describe.skipIf(process.env.TEST_TEMPORAL !== 'true')('durable read-only investigation', () => {
 let env: TestWorkflowEnvironment;
 beforeAll(async () => { env = await TestWorkflowEnvironment.createTimeSkipping(); }, 120000);
 afterAll(async () => { if (env) await env.teardown(); });
 it('escalates missing evidence and records the outcome', async () => {
  const recorded: unknown[] = [];
  const worker = await Worker.create({ connection:env.nativeConnection, taskQueue:'sentinel-test', workflowsPath:fileURLToPath(new URL('./index.ts',import.meta.url)), activities:{ collectEvidence:async()=>({available:false,summary:'unavailable'}), recordInvestigation:async (...args:unknown[])=>{recorded.push(args);} } });
  const input={workspaceId:'workspace',incidentId:'incident',serviceId:'service'};
  const result=await worker.runUntil(env.client.workflow.execute(investigateIncident,{ taskQueue:'sentinel-test',workflowId:'test-missing-evidence',args:[input] }));
  expect(result.status).toBe('escalated');
  expect(recorded).toHaveLength(1);
 },120000);
});
