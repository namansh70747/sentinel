import { workspaceAccess,isUuid } from '../../../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../../../lib/auth';
import { connectorError } from '../../../../../../../lib/connectors';
import { GitHubSyncRepository } from '@sentinel/db/github-sync';
export async function POST(request:Request,context:{params:Promise<{workspaceId:string;connectorId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,connectorId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!['admin','responder'].includes(access.role))return Response.json({error:'Responder access required'},{status:403});
 if(!isUuid(connectorId))return Response.json({error:'Invalid connector identifier'},{status:400});
 try{return Response.json(await new GitHubSyncRepository(getDatabase()).request(workspaceId,access.identity.id,connectorId),{status:202});}catch(error){return connectorError(error);}
}
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string;connectorId:string}>}){
 const {workspaceId,connectorId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!isUuid(connectorId))return Response.json({error:'Invalid connector identifier'},{status:400});
 try{const db=getDatabase();if(!await db.inWorkspace(workspaceId,async client=>(await client.query("SELECT 1 FROM connector_instances WHERE workspace_id=$1 AND id=$2 AND provider='github'",[workspaceId,connectorId])).rowCount))return Response.json({error:'GitHub connection not found'},{status:404});const repository=new GitHubSyncRepository(db);const [requests,resources]=await Promise.all([repository.requests(workspaceId,connectorId),repository.health(workspaceId,connectorId)]);return Response.json({requests,resources},{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
