import 'server-only';
import { ConnectorRepository, ConnectorStateError } from '@sentinel/db/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';
import { getDatabase } from './auth';
let repository:Promise<ConnectorRepository>|undefined;
export function connectorRepository(){
 const path=process.env.SENTINEL_CONNECTOR_KEY_FILE;
 if(!path)throw new Error('Connector encryption key is not configured');
 return repository??=(SecretVault.fromFile(path).then(vault=>new ConnectorRepository(getDatabase(),vault)).catch(error=>{repository=undefined;throw error;}));
}
export function connectorError(error:unknown){
 if(error instanceof ConnectorStateError)return Response.json({error:error.message},{status:error.code==='not-found'?404:error.code==='capacity'?429:409});
 return Response.json({error:'Connector operation failed. Check configuration and server availability.'},{status:503});
}
export async function boundedBody(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new Error('JSON body required');
 const chunks:Uint8Array[]=[];let length=0;
 while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>65536){await reader.cancel();throw new Error('Request exceeds 64 KiB');}chunks.push(part.value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
