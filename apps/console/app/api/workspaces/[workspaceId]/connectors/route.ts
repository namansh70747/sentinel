import { workspaceAccess } from '../../../../../lib/workspace-access';
import { boundedBody, connectorError, connectorRepository } from '../../../../../lib/connectors';
import { parseConnector, parseSecret } from '@sentinel/connectors/config';
export async function GET(_:Request,context:{params:Promise<{workspaceId:string}>}){
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 try{return Response.json(await(await connectorRepository()).list(workspaceId),{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 let draft,secret;
 try{const body=await boundedBody(request);const {secret:credentials,...config}=body;draft=parseConnector(config);secret=parseSecret(draft.provider,credentials??{});}catch{return Response.json({error:'Provide valid connector configuration; keep credentials in the secret field.'},{status:400});}
 try{return Response.json(await(await connectorRepository()).create(workspaceId,access.identity.id,draft,secret),{status:201});}catch(error){return connectorError(error);}
}
