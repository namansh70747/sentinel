import { workspaceAccess,isUuid } from '../../../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../../../lib/auth';
import { connectorError,connectorRepository } from '../../../../../../../lib/connectors';
import { OperationalFindingsRepository } from '@sentinel/db/operational-findings';
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string;serviceId:string}>}){
 const {workspaceId,serviceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!isUuid(serviceId))return Response.json({error:'Invalid service identifier'},{status:400});
 try{return Response.json(await new OperationalFindingsRepository(getDatabase()).read(workspaceId,serviceId),{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string;serviceId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,serviceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!['admin','responder'].includes(access.role))return Response.json({error:'Responder access required'},{status:403});
 if(!isUuid(serviceId))return Response.json({error:'Invalid service identifier'},{status:400});
 try{const connection=await(await connectorRepository()).resolve(workspaceId,serviceId,'kubernetes');if(!connection)return Response.json({error:'Map an enabled Kubernetes connection to this service first'},{status:404});return Response.json(await new OperationalFindingsRepository(getDatabase()).collect(workspaceId,access.identity.id,serviceId,connection),{status:201});}catch(error){return connectorError(error);}
}
