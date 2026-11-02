import 'server-only';
import { currentIdentity,getDatabase } from './auth';
export const isUuid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function workspaceAccess(workspaceId:string) {
 const identity=await currentIdentity();
 if(!identity)return {error:Response.json({error:'Authentication required'},{status:401})} as const;
 if(!isUuid(workspaceId))return {error:Response.json({error:'Invalid workspace identifier'},{status:400})} as const;
 const row=(await getDatabase().pool.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2',[workspaceId,identity.id])).rows[0];
 if(!row)return {error:Response.json({error:'Workspace not found'},{status:404})} as const;
 return {identity,role:row.role as string} as const;
}
