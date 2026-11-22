import { workspaceAccess,isUuid } from '../../../../../../../../lib/workspace-access';
import { boundedBody,connectorError,connectorRepository } from '../../../../../../../../lib/connectors';
import { providers,parseBinding,type Provider } from '@sentinel/connectors/config';
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string;serviceId:string;provider:string}>}){
 const {workspaceId,serviceId,provider}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(!isUuid(serviceId)||!providers.includes(provider as Provider))return Response.json({error:'Invalid service or provider'},{status:400});
 try{const bindings=await(await connectorRepository()).bindings(workspaceId,serviceId);return Response.json(bindings.find(row=>row.provider===provider)??null,{headers:{'cache-control':'no-store'}});}catch(error){return connectorError(error);}
}
export async function PUT(request:Request,context:{params:Promise<{workspaceId:string;serviceId:string;provider:string}>}){
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return Response.json({error:'Invalid origin'},{status:403});
 const {workspaceId,serviceId,provider}=await context.params,access=await workspaceAccess(workspaceId);if(access.error)return access.error;
 if(access.role!=='admin')return Response.json({error:'Administrator access required'},{status:403});
 if(!isUuid(serviceId)||!providers.includes(provider as Provider))return Response.json({error:'Invalid service or provider'},{status:400});
 let body,mapping;
 try{body=await boundedBody(request);if(!isUuid(body.connectorId)||!Number.isInteger(body.expectedVersion)||body.expectedVersion<1)throw new Error();mapping=parseBinding(provider as Provider,body.mapping);}catch{return Response.json({error:'Connector, expectedVersion and provider mapping are required.'},{status:400});}
 try{return Response.json(await(await connectorRepository()).bind(workspaceId,access.identity.id,serviceId,provider as Provider,body.connectorId,body.expectedVersion,mapping));}catch(error){return connectorError(error);}
}
