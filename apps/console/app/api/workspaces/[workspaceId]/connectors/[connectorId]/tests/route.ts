import { workspaceAccess, isUuid } from '../../../../../../../lib/workspace-access';
import { connectorError, connectorRepository } from '../../../../../../../lib/connectors';
export async function POST(request:Request,context:{params:Promise<{workspaceId:string;connectorId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,connectorId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 if(!isUuid(connectorId))return Response.json({error:'Invalid connector identifier'},{status:400});
 try{return Response.json(await(await connectorRepository()).queueTest(workspaceId,access.identity.id,connectorId),{status:202});}catch(error){return connectorError(error);}
}
