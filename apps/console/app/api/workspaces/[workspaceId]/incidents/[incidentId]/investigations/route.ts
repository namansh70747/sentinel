import { workspaceAccess,isUuid } from '../../../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../../../lib/auth';
import { connectorError } from '../../../../../../../lib/connectors';
import { InvestigationRepository } from '@sentinel/db/investigations';
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string;incidentId:string}>}){
 const {workspaceId,incidentId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!isUuid(incidentId))return Response.json({error:'Invalid incident identifier'},{status:400});
 try{return Response.json(await new InvestigationRepository(getDatabase()).list(workspaceId,incidentId),{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string;incidentId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,incidentId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!['admin','responder'].includes(access.role))return Response.json({error:'Responder access required'},{status:403});
 if(!isUuid(incidentId))return Response.json({error:'Invalid incident identifier'},{status:400});
 try{const run=await new InvestigationRepository(getDatabase()).create(workspaceId,incidentId,access.identity.id);return Response.json(run,{status:202,headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
