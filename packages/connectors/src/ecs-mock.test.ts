import { describe,it,expect,vi } from 'vitest';
import { MockEcsReadClient } from './ecs-mock';
import { investigate, report } from '../../../apps/showcase/model';
describe('credential-free demo investigation',()=>{
 it('runs without network or credentials and keeps provenance',async()=>{
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
  try {
   const run=await investigate('deployment',new Date('2026-11-16T10:00:00Z'),'SNT-TEST');
   expect(network).not.toHaveBeenCalled(); expect(run.ecs?.runningCount).toBe(1);
   expect(run.ecs?.simulated).toBe(true); expect(run.metrics.source).toBe('mock');
   expect(run.summary).toContain('root cause is unconfirmed');
   expect(report(run)).toContain('No live AWS');
  } finally { network.mockRestore(); }
 });
 it('healthy scenario has all tasks and no recommended remediation',async()=>{
  const run=await investigate('healthy');expect(run.ecs?.runningCount).toBe(3);expect(run.status).toBe('complete');
 });
 it('shows read failures as partial evidence with an audit event',async()=>{
  const run=await investigate('aws-error'); expect(run.ecs).toBeNull();expect(run.status).toBe('partial');
  expect(run.error).toContain('Simulated AccessDenied');expect(run.audit.some(x=>x.action==='ecs.read_failed')).toBe(true);
 });
 it('does not classify stale healthy-looking observations as current health',async()=>{
  const run=await investigate('stale',new Date('2026-11-16T10:00:00Z'));
  expect(run.status).toBe('needs-data');expect(run.metrics.observedAt).toBe('2026-11-16T09:35:00.000Z');
  expect(run.summary).toContain('health is unknown');
 });
 it('rejects real or out-of-scope resource identifiers',async()=>{
  await expect(new MockEcsReadClient().observe('arn:aws:ecs:us-east-1:123456789012:service/real/api')).rejects.toThrow('fictional');
 });
});
