import { assertPostmortem, draftPostmortem, postmortemMarkdown, type DraftEvidence } from '@sentinel/engine';
import { getDatabase } from '../../../../../../../lib/auth';
import { isUuid, workspaceAccess } from '../../../../../../../lib/workspace-access';
export async function GET(_: Request, context: { params: Promise<{ workspaceId: string; incidentId: string }> }) {
 const { workspaceId, incidentId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 if (!isUuid(incidentId)) return Response.json({ error: 'Invalid incident identifier' }, { status: 400 });
 const row = await getDatabase().inWorkspace(workspaceId, async client => (await client.query('SELECT version,created_at FROM postmortems WHERE workspace_id=$1 AND incident_id=$2 ORDER BY version DESC LIMIT 1', [workspaceId, incidentId])).rows[0] ?? null);
 return Response.json(row ?? { version: 0 });
}
export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; incidentId: string }> }) {
 if (request.headers.get('origin') !== process.env.SENTINEL_PUBLIC_URL) return Response.json({ error: 'Invalid origin' }, { status: 403 });
 const { workspaceId, incidentId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 if (!['admin', 'responder'].includes(access.role)) return Response.json({ error: 'Responder access required' }, { status: 403 });
 if (!isUuid(incidentId)) return Response.json({ error: 'Invalid incident identifier' }, { status: 400 });
 const db = getDatabase();
 const saved = await db.inWorkspace(workspaceId, async client => {
  const incident = (await client.query('SELECT id FROM incidents WHERE workspace_id=$1 AND id=$2', [workspaceId, incidentId])).rows[0];
  if (!incident) return null;
  const evidence = (await client.query("SELECT attempt_id::text AS id,source,outcome,provenance,COALESCE(detail->>'summary',source) AS summary FROM investigation_evidence WHERE workspace_id=$1 AND incident_id=$2", [workspaceId, incidentId])).rows as DraftEvidence[];
  const notes = (await client.query('SELECT body FROM incident_notes WHERE workspace_id=$1 AND incident_id=$2 ORDER BY created_at', [workspaceId, incidentId])).rows.map(row => String(row.body));
  const advisory = (await client.query(
   "SELECT coalesce(nullif(advisory_model_result->'revision','null'::jsonb),advisory) AS advisory FROM investigation_runs WHERE workspace_id=$1 AND incident_id=$2 AND advisory IS NOT NULL ORDER BY finished_at DESC,id DESC LIMIT 1",
   [workspaceId, incidentId],
  )).rows[0]?.advisory;
  const sections = draftPostmortem(evidence.filter(row => row.provenance !== 'simulated'), notes);
  if (advisory?.nextStep) sections.push({kind:'action',body:advisory.nextStep,evidenceId:advisory.evidenceRefs?.[0] ?? null});
  assertPostmortem(sections);
  const version = Number((await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM postmortems WHERE workspace_id=$1 AND incident_id=$2', [workspaceId, incidentId])).rows[0].version);
  await client.query('INSERT INTO postmortems(workspace_id,incident_id,version,created_by) VALUES($1,$2,$3,$4)', [workspaceId, incidentId, version, access.identity.id]);
  for (const [position, section] of sections.entries()) await client.query('INSERT INTO postmortem_sections(workspace_id,incident_id,version,position,kind,body,evidence_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [workspaceId, incidentId, version, position, section.kind, section.body, section.evidenceId]);
  await db.appendAuditInTransaction(client, workspaceId, access.identity.id, 'postmortem.drafted', { incidentId, version });
  return { version, markdown: postmortemMarkdown(sections) };
 });
 return saved ? Response.json(saved, { status: 201 }) : Response.json({ error: 'Investigation not found' }, { status: 404 });
}
