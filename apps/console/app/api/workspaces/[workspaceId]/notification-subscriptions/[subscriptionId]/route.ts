import { workspaceAccess,isUuid } from '../../../../../../lib/workspace-access';
import { notificationRepository } from '../../../../../../lib/notifications';
import { boundedBody,connectorError } from '../../../../../../lib/connectors';
export async function PATCH(request:Request,context:{params:Promise<{workspaceId:string;subscriptionId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,subscriptionId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 if(!isUuid(subscriptionId))return Response.json({error:'Invalid subscription'},{status:400});
 try{if((await boundedBody(request)).enabled!==false)throw new Error();}catch{return Response.json({error:'Only disabling is supported; reapprove a destination to enable it.'},{status:400});}
 try{await(await notificationRepository()).disable(workspaceId,access.identity.id,subscriptionId);return Response.json({disabled:true});}catch(error){return connectorError(error);}
}
