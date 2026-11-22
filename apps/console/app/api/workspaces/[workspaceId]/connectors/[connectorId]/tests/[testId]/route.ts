import { workspaceAccess,isUuid } from '../../../../../../../../lib/workspace-access';
import { connectorError, connectorRepository } from '../../../../../../../../lib/connectors';
export async function GET(_:Request,context:{params:Promise<{workspaceId:string;connectorId:string;testId:string}>}){
 const {workspaceId,connectorId,testId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!isUuid(connectorId)||!isUuid(testId))return Response.json({error:'Invalid identifier'},{status:400});
 try{const test=await(await connectorRepository()).getTest(workspaceId,connectorId,testId);return test?Response.json(test,{headers:{'cache-control':'no-store'}}):Response.json({error:'Connection test not found'},{status:404});}catch(error){return connectorError(error);}
}
