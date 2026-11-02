import { generateKeyPairSync } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { signPlaybook, verifyPlaybook, executionPlanHash } from './signatures';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const scope = { serviceId: 'service-a', resourceArn: 'arn:service:a' };
const playbook = { id: 'rollback', ...scope, version: 1, expiresAt: '2030-01-01T00:00:00Z' };
describe('execution authority', () => {
 it('verifies a signed playbook and rejects tampering, scope mismatch and expiry', () => {
  const signed = signPlaybook(playbook, privateKey);
  expect(verifyPlaybook(signed, publicKey, scope, 0)).toBe(true);
  expect(verifyPlaybook({ ...signed, id: 'delete' }, publicKey, scope, 0)).toBe(false);
  expect(verifyPlaybook(signed, publicKey, { ...scope, serviceId: 'other' }, 0)).toBe(false);
  expect(verifyPlaybook(signed, publicKey, scope, Date.parse('2031-01-01'))).toBe(false);
 });
 it('binds approval plans to workspace, evidence and exact revisions', () => {
  const plan = { workspaceId: 'a', ...scope, playbookId: 'rollback', playbookVersion: 1, fromRevision: '2', toRevision: '1', evidenceHash: 'abc', expiresAt: playbook.expiresAt };
  expect(executionPlanHash(plan)).toHaveLength(64);
  for (const changes of [{ workspaceId: 'b' }, { evidenceHash: 'def' }, { toRevision: '3' }]) expect(executionPlanHash({ ...plan, ...changes })).not.toBe(executionPlanHash(plan));
 });
});
