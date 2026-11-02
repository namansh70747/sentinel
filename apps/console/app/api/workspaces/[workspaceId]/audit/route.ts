import { verifyAuditSegment } from "@sentinel/db";
import { workspaceAccess } from '../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../lib/auth';
export async function GET(_:Request,context:{params:Promise<{workspaceId:string}>}) {
 const {workspaceId}=await context.params;const access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 const rows=await getDatabase().inWorkspace(workspaceId,async client=>(await client.query('SELECT workspace_id,id,sequence,actor,action,payload,previous_hash,hash,hash_version,created_at FROM audit_events ORDER BY sequence DESC LIMIT 100')).rows);
 return Response.json({events:rows,integrity:verifyAuditSegment([...rows].reverse())},{headers:{'cache-control':'no-store'}});
}
