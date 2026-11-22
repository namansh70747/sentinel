import { workspaceAccess } from '../../../../../lib/workspace-access';
import { notificationRepository } from '../../../../../lib/notifications';
import { connectorError } from '../../../../../lib/connectors';
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string}>}){
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 try{return Response.json(await(await notificationRepository()).history(workspaceId),{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
