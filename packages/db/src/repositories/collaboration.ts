import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SentinelDatabase } from '../index';

const edges: Record<string, readonly string[]> = {
 investigating: ['advised', 'escalated', 'verifying'],
 advised: ['verifying', 'escalated', 'investigating'],
 escalated: ['investigating', 'verifying'],
 verifying: ['recovered', 'escalated', 'investigating'],
 recovered: ['closed'],
 awaiting_approval: ['investigating'],
 executing: ['verifying', 'escalated'],
 closed: [],
};
export async function appendWorkspaceEvent(client: PoolClient, workspaceId: string, type: string, subjectId: string | null, payload: Record<string, unknown>) {
 await client.query('INSERT INTO workspace_events(workspace_id,seq,type,subject_id,payload) VALUES($1,(SELECT COALESCE(MAX(seq),0)+1 FROM workspace_events WHERE workspace_id=$1),$2,$3,$4::jsonb)', [workspaceId, type, subjectId, JSON.stringify(payload)]);
}
export function qualifiesForRecovery(evidence: { outcome: string; provenance: string; detail: unknown; availability_target: number; latency_target_ms: number } | undefined) {
 if (!evidence || evidence.provenance!=='live' || !['ok','uncovered'].includes(evidence.outcome)) return false;
 const sample=evidence.detail as { good5m?: number; total5m?: number; p99_10m_ms?: number; coverage?: {windowSeconds:number;inputs:{input:string;covered:boolean}[]}[] } | null;
 const good=sample?.good5m, total=sample?.total5m, latency=sample?.p99_10m_ms;
 if (typeof good!=='number'||typeof total!=='number'||typeof latency!=='number') return false;
 if (![good,total,latency].every(Number.isFinite)||total<=0||good<0||good>total||latency<0) return false;
 const covered=(seconds:number,input:string)=>sample?.coverage?.some(w=>w.windowSeconds===seconds&&w.inputs.some(s=>s.input===input&&s.covered===true));
 return !!covered(300,'goodCoverageQuery')&&!!covered(300,'totalCoverageQuery')&&!!covered(600,'latencyCoverageQuery')
  && good/total>=evidence.availability_target&&latency<=evidence.latency_target_ms;
}
export class CollaborationRepository {
 constructor(private readonly db: SentinelDatabase) {}
 async notes(workspaceId: string, incidentId: string) {
  return this.db.inWorkspace(workspaceId, async client => (await client.query('SELECT id,author_identity_id AS "authorIdentityId",body,created_at AS "createdAt" FROM incident_notes WHERE workspace_id=$1 AND incident_id=$2 ORDER BY created_at', [workspaceId, incidentId])).rows);
 }
 async addNote(workspaceId: string, actor: string, incidentId: string, body: string) {
  const text = body.trim();
  if (text.length < 1 || text.length > 4000) throw new Error('Note must be 1–4000 characters');
  return this.db.inWorkspace(workspaceId, async client => {
   if (!(await client.query('SELECT id FROM incidents WHERE workspace_id=$1 AND id=$2', [workspaceId, incidentId])).rowCount) return null;
   const id = randomUUID();
   await client.query('INSERT INTO incident_notes(workspace_id,id,incident_id,author_identity_id,body) VALUES($1,$2,$3,$4,$5)', [workspaceId, id, incidentId, actor, text]);
   await appendWorkspaceEvent(client, workspaceId, 'incident.note', incidentId, { noteId: id });
   await this.db.appendAuditInTransaction(client, workspaceId, actor, 'incident.note', { incidentId, noteId: id });
   return { id };
  });
 }
 async transition(workspaceId: string, actor: string, incidentId: string, toState: string, reason: string, expectedVersion: number) {
  if (!reason.trim() || reason.length > 500) throw new Error('A transition reason is required');
  return this.db.inWorkspace(workspaceId, async client => {
   const incident = (await client.query('SELECT state,state_version,service_id FROM incidents WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [workspaceId, incidentId])).rows[0];
   if (!incident) return { error: 'missing' as const };
   if (Number(incident.state_version) !== expectedVersion) return { error: 'conflict' as const };
   if (!edges[incident.state]?.includes(toState)) return { error: 'invalid' as const };
   if (toState === 'recovered') {
    const evidence = (await client.query(`
     SELECT e.detail, e.observed_at, e.outcome, e.provenance,
       slo.availability_target, slo.latency_target_ms
     FROM investigation_evidence e
     JOIN investigation_runs r ON r.workspace_id=e.workspace_id AND r.id=e.run_id
     JOIN service_slos slo ON slo.workspace_id=e.workspace_id AND slo.service_id=e.service_id
     WHERE e.workspace_id=$1 AND e.incident_id=$2 AND e.service_id=$3 AND e.source='prometheus'
      AND r.status IN ('advised','escalated')
      AND e.observed_at >= now()-interval '5 minutes'
      AND e.observed_at <= now()
      AND e.observed_at >= (SELECT max(created_at) FROM incident_transitions
       WHERE workspace_id=$1 AND incident_id=$2 AND to_state='verifying')
     ORDER BY e.observed_at DESC LIMIT 1`, [workspaceId, incidentId, incident.service_id])).rows[0];
    if (!qualifiesForRecovery(evidence)) return { error: 'unrecovered' as const };
   }
   await client.query('UPDATE incidents SET state=$3,state_version=state_version+1 WHERE workspace_id=$1 AND id=$2', [workspaceId, incidentId, toState]);
   const id = randomUUID();
   await client.query('INSERT INTO incident_transitions(workspace_id,id,incident_id,from_state,to_state,actor,reason) VALUES($1,$2,$3,$4,$5,$6,$7)', [workspaceId, id, incidentId, incident.state, toState, actor, reason.trim()]);
   await appendWorkspaceEvent(client, workspaceId, 'incident.transition', incidentId, { from: incident.state, to: toState });
   await this.db.appendAuditInTransaction(client, workspaceId, actor, 'incident.transition', { incidentId, from: incident.state, to: toState });
   return { state: toState, stateVersion: Number(incident.state_version) + 1 };
  });
 }
 async events(workspaceId: string, cursor: number) {
  return this.db.inWorkspace(workspaceId, async client => (await client.query('SELECT seq,type,subject_id AS "subjectId",payload,created_at AS "createdAt" FROM workspace_events WHERE workspace_id=$1 AND seq>$2 ORDER BY seq LIMIT 100', [workspaceId, cursor])).rows);
 }
}
