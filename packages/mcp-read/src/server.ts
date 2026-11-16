import type { SentinelDatabase } from '@sentinel/db';
export const tools = ['list_incidents', 'get_incident', 'read_audit'] as const;
export async function callTool(db: SentinelDatabase, name: typeof tools[number], workspaceId: string, incidentId?: string) {
 if (!tools.includes(name)) throw new Error('Unknown tool');
 return db.inWorkspace(workspaceId, async client => {
  if (name === 'list_incidents') return (await client.query('SELECT id, title, state, severity FROM incidents WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50', [workspaceId])).rows;
  if (name === 'get_incident') return (await client.query('SELECT source, outcome, provenance, window_covered FROM incident_evidence WHERE workspace_id=$1 AND incident_id=$2 ORDER BY source', [workspaceId, incidentId])).rows;
  return (await client.query('SELECT sequence, action FROM audit_events WHERE workspace_id=$1 ORDER BY sequence', [workspaceId])).rows;
 });
}
