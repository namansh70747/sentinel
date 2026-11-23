import { loadEnvFile } from 'node:process';
import { readFile,writeFile } from 'node:fs/promises';
import { SentinelDatabase } from '@sentinel/db';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';
import { parseConnector,parseSecret } from '@sentinel/connectors/config';
loadEnvFile('.local/compose.env');
const owner=JSON.parse(await readFile('.local/owner.json','utf8')),local=JSON.parse(await readFile('.local/kubernetes/connection.json','utf8'));
if(local.endpoint!=='https://k3d-sentinel-local-server-0:6443'||local.namespace!=='sentinel-demo')throw new Error('Expected only the dedicated local fixture connection');
const db=new SentinelDatabase(`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD!)}@127.0.0.1:55441/sentinel`);
try{
 const vault=await SecretVault.fromFile('.local/connector-key'),repository=new ConnectorRepository(db,vault),workspace=owner.workspaceId;
 const actor=(await db.pool.query('SELECT id FROM identities WHERE issuer=$1 AND subject=$2',[owner.issuer,owner.subject])).rows[0]?.id;if(!actor)throw new Error('Bootstrap the local owner first');
 const service=await db.inWorkspace(workspace,async c=>(await c.query("SELECT id FROM services WHERE workspace_id=$1 AND name='checkout-api'",[workspace])).rows[0]);if(!service)throw new Error('Local checkout-api service is absent; configure your service mapping through the UI instead');
 const draft=parseConnector({provider:'kubernetes',name:'Local Kubernetes',mode:'live',config:{endpoint:local.endpoint,namespace:local.namespace,certificateAuthority:local.certificateAuthority}}),secret=parseSecret('kubernetes',{token:local.token});
 let connection=(await repository.list(workspace)).find(row=>row.provider==='kubernetes'&&row.name==='Local Kubernetes');
 if(connection){
  if(connection.config.endpoint!==draft.config.endpoint||connection.config.namespace!==draft.config.namespace)throw new Error('Existing named connection has a different target and was preserved');
  const row=await db.inWorkspace(workspace,async c=>(await c.query('SELECT secret_envelope FROM connector_instances WHERE workspace_id=$1 AND id=$2',[workspace,connection!.id])).rows[0]);
  const previous=row.secret_envelope?vault.open(workspace,connection.id,row.secret_envelope):{};
  if(previous.token!==secret.token||connection.config.certificateAuthority!==draft.config.certificateAuthority)connection=await repository.update(workspace,actor,connection.id,connection.configVersion,{...draft,mode:connection.mode},secret);
 }else connection=await repository.create(workspace,actor,draft,secret);
 const binding=(await repository.bindings(workspace,service.id)).find(row=>row.provider==='kubernetes');
 if(!binding)await repository.bind(workspace,actor,service.id,'kubernetes',connection.id,connection.configVersion,{namespace:'sentinel-demo',labelSelector:'app=checkout'});
 await writeFile('.local/kubernetes/import.json',JSON.stringify({workspaceId:workspace,serviceId:service.id,connectorId:connection.id,configVersion:connection.configVersion})+'\n',{mode:0o600});
 console.log('Local Kubernetes credentials encrypted in workspace storage. Existing service bindings and disabled modes were preserved. Run a capability test and service observation to verify actual reads.');
}finally{await db.close();}
