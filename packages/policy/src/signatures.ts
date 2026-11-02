import { createHash, sign, verify, type KeyLike } from 'node:crypto';

export interface SignedPlaybook {
  id: string;
  serviceId: string;
  resourceArn: string;
  version: number;
  expiresAt: string;
  signature: string;
}

export function playbookPayload(playbook: Omit<SignedPlaybook, 'signature'>): string {
  return JSON.stringify([playbook.id, playbook.serviceId, playbook.resourceArn, playbook.version, playbook.expiresAt]);
}

export function signPlaybook(playbook: Omit<SignedPlaybook, 'signature'>, privateKey: KeyLike): SignedPlaybook {
  return { ...playbook, signature: sign(null, Buffer.from(playbookPayload(playbook)), privateKey).toString('base64') };
}

export function verifyPlaybook(playbook: SignedPlaybook, publicKey: KeyLike, scope: { serviceId: string; resourceArn: string }, now = Date.now()): boolean {
  if (playbook.serviceId !== scope.serviceId || playbook.resourceArn !== scope.resourceArn || !Number.isFinite(Date.parse(playbook.expiresAt)) || Date.parse(playbook.expiresAt) <= now || !Number.isSafeInteger(playbook.version) || playbook.version < 1) return false;
  try { return verify(null, Buffer.from(playbookPayload(playbook)), publicKey, Buffer.from(playbook.signature, 'base64')); } catch { return false; }
}

export function executionPlanHash(input: { workspaceId: string; serviceId: string; resourceArn: string; playbookId: string; playbookVersion: number; fromRevision: string; toRevision: string; evidenceHash: string; expiresAt: string }): string {
  return createHash('sha256').update(JSON.stringify([input.workspaceId, input.serviceId, input.resourceArn, input.playbookId, input.playbookVersion, input.fromRevision, input.toRevision, input.evidenceHash, input.expiresAt])).digest('hex');
}
