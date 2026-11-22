import { workspaceAccess, isUuid } from '../../../../../../lib/workspace-access';
import { boundedBody, connectorError, connectorRepository } from '../../../../../../lib/connectors';
import { parseConnector, parseSecret } from '@sentinel/connectors/config';
export async function PATCH(request:Request,context:{params:Promise<{workspaceId:string;connectorId:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,connectorId}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 if(!isUuid(connectorId))return Response.json({error:'Invalid connector identifier'},{status:400});
 let draft,secret,version;
 try{const body=await boundedBody(request);const {secret:credentials,expectedVersion,...config}=body;draft=parseConnector(config);version=expectedVersion;if(!Number.isInteger(version)||version<1)throw new Error();secret=credentials===undefined?undefined:parseSecret(draft.provider,credentials);}catch{return Response.json({error:'Valid configuration and expectedVersion are required.'},{status:400});}
 try{return Response.json(await(await connectorRepository()).update(workspaceId,access.identity.id,connectorId,version,draft,secret));}catch(error){return connectorError(error);}
}
