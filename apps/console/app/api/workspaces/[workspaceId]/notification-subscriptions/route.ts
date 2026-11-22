import { workspaceAccess,isUuid } from '../../../../../lib/workspace-access';
import { notificationRepository } from '../../../../../lib/notifications';
import { boundedBody,connectorError } from '../../../../../lib/connectors';
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string}>}){
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 try{return Response.json(await(await notificationRepository()).subscriptions(workspaceId),{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 let body;try{body=await boundedBody(request);if(!isUuid(body.serviceId)||!isUuid(body.connectorId)||!Number.isInteger(body.expectedVersion)||body.expectedVersion<1||typeof body.destinationLabel!=='string'||!body.destinationLabel.trim()||body.destinationLabel.length>160||body.approvedTestDestination!==true)throw new Error();}catch{return Response.json({error:'Select a service, current connector and explicitly approve its test destination.'},{status:400});}
 try{return Response.json(await(await notificationRepository()).subscribe(workspaceId,access.identity.id,body),{status:201});}catch(error){return connectorError(error);}
}
