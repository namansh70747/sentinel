import { workspaceAccess } from '../../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../../lib/auth';
import { runbookError } from '../../../../../../lib/runbooks';
import { RunbookRepository } from '@sentinel/db/runbooks';
export async function GET(request:Request,context:{params:Promise<{workspaceId:string;runbookId:string}>}){
 const {workspaceId,runbookId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 const rawVersion=new URL(request.url).searchParams.get('version');
 try{const document=await new RunbookRepository(getDatabase()).get(workspaceId,runbookId,rawVersion===null?undefined:Number(rawVersion));return document?Response.json(document,{headers:{'cache-control':'no-store'}}):Response.json({error:'Runbook not found'},{status:404});}catch(error){return runbookError(error);}
}
