import { getDatabase } from '../../../../../lib/auth';
import { workspaceAccess } from '../../../../../lib/workspace-access';
export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
 const { workspaceId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 const rows = await getDatabase().inWorkspace(workspaceId, async client => (await client.query("SELECT id,service_id AS \"serviceId\",provider,outcome,provenance,collected_at AS \"collectedAt\" FROM operational_findings WHERE workspace_id=$1 ORDER BY collected_at DESC LIMIT 50", [workspaceId])).rows);
 return Response.json(rows, { headers: { 'cache-control': 'no-store' } });
}
