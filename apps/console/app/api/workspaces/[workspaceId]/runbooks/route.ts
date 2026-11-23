import { workspaceAccess } from '../../../../../lib/workspace-access';
import { getDatabase } from '../../../../../lib/auth';
import { boundedBody } from '../../../../../lib/connectors';
import { runbookError } from '../../../../../lib/runbooks';
import { RunbookRepository } from '@sentinel/db/runbooks';

export async function GET(request:Request,context:{params:Promise<{workspaceId:string}>}){
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 const url=new URL(request.url);
 try{return Response.json(await new RunbookRepository(getDatabase()).search(workspaceId,url.searchParams.get('q')??'',url.searchParams.get('serviceId')??undefined),{headers:{'cache-control':'no-store'}});}catch(error){return runbookError(error);}
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 let body;try{body=await boundedBody(request,524288);}catch{return Response.json({error:'Provide valid JSON within 512 KiB.'},{status:400});}
 try{return Response.json(await new RunbookRepository(getDatabase()).import(workspaceId,access.identity.id,body),{status:201});}catch(error){return runbookError(error);}
}
