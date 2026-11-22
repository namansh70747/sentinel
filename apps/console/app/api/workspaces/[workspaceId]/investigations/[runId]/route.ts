import { workspaceAccess,isUuid } from '../../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../../lib/auth';
import { connectorError } from '../../../../../../lib/connectors';
import { InvestigationRepository } from '@sentinel/db/investigations';
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string;runId:string}>}){
 const {workspaceId,runId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!isUuid(runId))return Response.json({error:'Invalid run identifier'},{status:400});
 try{const run=await new InvestigationRepository(getDatabase()).get(workspaceId,runId);return run?Response.json(run,{headers:{'cache-control':'no-store'}}):Response.json({error:'Investigation not found'},{status:404});}catch(error){return connectorError(error);}
}
