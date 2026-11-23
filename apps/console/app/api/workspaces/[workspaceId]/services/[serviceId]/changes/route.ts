import { workspaceAccess,isUuid } from '../../../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../../../lib/auth';
import { connectorError } from '../../../../../../../lib/connectors';
import { GitHubSyncRepository } from '@sentinel/db/github-sync';
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string;serviceId:string}>}){
 const {workspaceId,serviceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!isUuid(serviceId))return Response.json({error:'Invalid service identifier'},{status:400});
 try{return Response.json(await new GitHubSyncRepository(getDatabase()).changes(workspaceId,serviceId),{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
