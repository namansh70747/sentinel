import { workspaceAccess,isUuid } from '../../../../../../../lib/workspace-access';
import { notificationRepository } from '../../../../../../../lib/notifications';
import { connectorError } from '../../../../../../../lib/connectors';
export async function POST(request:Request,context:{params:Promise<{workspaceId:string;subscriptionId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,subscriptionId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!['admin','responder'].includes(access.role))return Response.json({error:'Responder access required'},{status:403});
 if(!isUuid(subscriptionId))return Response.json({error:'Invalid subscription'},{status:400});
 try{return Response.json(await(await notificationRepository()).queueTest(workspaceId,access.identity.id,subscriptionId),{status:202});}catch(error){return connectorError(error);}
}
