import { getDatabase } from '../../../../../../lib/auth';
import { isUuid, workspaceAccess } from '../../../../../../lib/workspace-access';

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string; incidentId: string }> }) {
 const { workspaceId, incidentId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 if (!isUuid(incidentId)) return Response.json({error:'Invalid incident identifier'},{status:400});
 const incident = await getDatabase().inWorkspace(workspaceId, async client => {
  const row = (await client.query(`SELECT i.*, j.dispatched_at,
   (SELECT e.severity FROM incident_evidence e WHERE e.workspace_id=i.workspace_id AND e.incident_id=i.id AND e.source='prometheus' AND (e.outcome='ok' OR (e.outcome='uncovered' AND e.detail->>'severityQualified'='true'))) AS observed_severity
   FROM incidents i LEFT JOIN investigation_jobs j ON j.workspace_id=i.workspace_id AND j.incident_id=i.id
   WHERE i.workspace_id=$1 AND i.id=$2`, [workspaceId,incidentId])).rows[0];
  if (!row) return null;
  const sources = (await client.query('SELECT source,outcome,provenance,observed_at,window_covered,detail FROM incident_evidence WHERE workspace_id=$1 AND incident_id=$2 ORDER BY source',[workspaceId,incidentId])).rows;
  return {...row,sources};
 });
 return incident ? Response.json(incident,{headers:{'cache-control':'no-store'}}) : Response.json({error:'Investigation not found'},{status:404});
}
