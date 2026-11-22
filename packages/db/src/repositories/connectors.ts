import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SentinelDatabase } from '../index';
import { parseBinding, parseConnector, parseSecret, type ConnectorDraft, type Provider } from '@sentinel/connectors/config';
import { SecretVault, type SealedSecret } from '@sentinel/connectors/secrets';

export class ConnectorStateError extends Error {
 constructor(public readonly code:'not-found'|'version-conflict'|'capacity',message:string){super(message);}
}
interface Row { id:string;workspace_id:string;provider:Provider;name:string;mode:'live'|'off';config:Record<string,string|number>;secret_envelope:SealedSecret|null;config_version:number;created_at:Date;updated_at:Date;last_test?:unknown;last_successful_read?:Date|null;bindings?:{serviceId:string;name:string}[] }
function present(row:Row){return {id:row.id,workspaceId:row.workspace_id,provider:row.provider,name:row.name,mode:row.mode,config:row.config,configVersion:row.config_version,hasSecret:row.secret_envelope!==null,createdAt:row.created_at,updatedAt:row.updated_at,lastTest:row.last_test??null,lastSuccessfulRead:row.last_successful_read??null,bindings:row.bindings??[]};}
export interface ConnectionTestResult {outcome:'verified-read'|'reachable'|'empty'|'not-configured'|'unavailable'|'denied'|'unsupported';capability:string;recordCount:number;errorCode?:string}
export class ConnectorRepository {
 constructor(private readonly db:SentinelDatabase,private readonly vault:SecretVault){}
 private async snapshot(client:PoolClient,row:Row){await client.query('INSERT INTO connector_versions(workspace_id,connector_id,version,name,mode,config,secret_envelope) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.workspace_id,row.id,row.config_version,row.name,row.mode,row.config,row.secret_envelope]);}
 async create(workspaceId:string,actor:string,draft:ConnectorDraft,secret:Record<string,string>){
  const value=parseConnector(draft),credentials=parseSecret(value.provider,secret),id=randomUUID();
  const sealed=Object.keys(credentials).length?this.vault.seal(workspaceId,id,credentials):null;
  return this.db.inWorkspace(workspaceId,async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`connector-create:${workspaceId}`]);
   const count=await client.query('SELECT count(*)::int AS total FROM connector_instances WHERE workspace_id=$1',[workspaceId]);
   if(count.rows[0].total>=100)throw new ConnectorStateError('capacity','Workspace connection limit reached');
   const row=(await client.query('INSERT INTO connector_instances(workspace_id,id,provider,name,mode,config,secret_envelope) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[workspaceId,id,value.provider,value.name,value.mode,value.config,sealed])).rows[0] as Row;
   await this.snapshot(client,row);
   await this.db.appendAuditInTransaction(client,workspaceId,actor,'connector.created',{connectorId:id,provider:value.provider,configVersion:1});
   return present(row);
  });
 }
 async list(workspaceId:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query(`SELECT c.*,
  (SELECT coalesce(json_agg(json_build_object('serviceId',b.service_id,'name',s.name)),'[]'::json) FROM service_connector_bindings b JOIN services s ON s.workspace_id=b.workspace_id AND s.id=b.service_id WHERE b.workspace_id=c.workspace_id AND b.connector_id=c.id) AS bindings,
  (SELECT json_build_object('id',t.id,'status',t.status,'result',t.result,'finishedAt',t.finished_at,'configVersion',t.config_version) FROM connector_tests t WHERE t.workspace_id=c.workspace_id AND t.connector_id=c.id ORDER BY t.created_at DESC LIMIT 1) AS last_test,
  (SELECT max(t.finished_at) FROM connector_tests t WHERE t.workspace_id=c.workspace_id AND t.connector_id=c.id AND t.config_version=c.config_version AND t.result->>'outcome'='verified-read') AS last_successful_read
  FROM connector_instances c WHERE c.workspace_id=$1 ORDER BY c.created_at DESC LIMIT 100`,[workspaceId])).rows.map(present));}
 async get(workspaceId:string,id:string){return this.db.inWorkspace(workspaceId,async client=>{const row=(await client.query('SELECT * FROM connector_instances WHERE workspace_id=$1 AND id=$2',[workspaceId,id])).rows[0];return row?present(row):null;});}
 async update(workspaceId:string,actor:string,id:string,expectedVersion:number,draft:ConnectorDraft,secret?:Record<string,string>){
  const value=parseConnector(draft);
  return this.db.inWorkspace(workspaceId,async client=>{
   const existing=(await client.query('SELECT * FROM connector_instances WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,id])).rows[0] as Row|undefined;
   if(!existing)throw new ConnectorStateError('not-found','Connector not found');
   if(existing.config_version!==expectedVersion)throw new ConnectorStateError('version-conflict','Connector version changed; reload before editing');
   if(existing.provider!==value.provider)throw new Error('Connector provider cannot change');
   // A manager may edit configuration without being able to read an existing
   // secret. Moving that secret to another origin must require explicit input.
   const originChanged=existing.config.endpoint!==undefined&&value.config.endpoint!==undefined&&new URL(String(existing.config.endpoint)).origin!==new URL(String(value.config.endpoint)).origin;
   const credentials=secret===undefined?(originChanged?{}:undefined):parseSecret(value.provider,secret);
   const sealed=credentials===undefined?existing.secret_envelope:Object.keys(credentials).length?this.vault.seal(workspaceId,id,credentials):null;
   const row=(await client.query('UPDATE connector_instances SET name=$1,mode=$2,config=$3,secret_envelope=$4,config_version=config_version+1,updated_at=now() WHERE workspace_id=$5 AND id=$6 RETURNING *',[value.name,value.mode,value.config,sealed,workspaceId,id])).rows[0] as Row;
   await this.snapshot(client,row);await this.db.appendAuditInTransaction(client,workspaceId,actor,'connector.updated',{connectorId:id,configVersion:row.config_version});return present(row);
  });
 }
 async bind(workspaceId:string,actor:string,serviceId:string,provider:Provider,connectorId:string,expectedVersion:number,mapping:unknown){
  const parsed=parseBinding(provider,mapping);
  return this.db.inWorkspace(workspaceId,async client=>{
   const connector=(await client.query('SELECT config_version FROM connector_instances WHERE workspace_id=$1 AND id=$2 AND provider=$3 FOR SHARE',[workspaceId,connectorId,provider])).rows[0];
   if(!connector)throw new ConnectorStateError('not-found','Connector not found');
   if(connector.config_version!==expectedVersion)throw new ConnectorStateError('version-conflict','Connector version changed');
   if(!(await client.query('SELECT id FROM services WHERE workspace_id=$1 AND id=$2',[workspaceId,serviceId])).rowCount)throw new ConnectorStateError('not-found','Service not found');
   await client.query('INSERT INTO service_connector_bindings(workspace_id,service_id,provider,connector_id,mapping) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,service_id,provider) DO UPDATE SET connector_id=EXCLUDED.connector_id,mapping=EXCLUDED.mapping,updated_at=now()',[workspaceId,serviceId,provider,connectorId,parsed]);
   await this.db.appendAuditInTransaction(client,workspaceId,actor,'connector.bound',{connectorId,serviceId,provider,configVersion:expectedVersion});return {serviceId,connectorId,provider,mapping:parsed};
  });
 }
 async bindings(workspaceId:string,serviceId:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query('SELECT provider,connector_id AS "connectorId",mapping,updated_at AS "updatedAt" FROM service_connector_bindings WHERE workspace_id=$1 AND service_id=$2',[workspaceId,serviceId])).rows);}
 async resolve(workspaceId:string,serviceId:string,provider:Provider){return this.db.inWorkspace(workspaceId,async client=>{
  const row=(await client.query('SELECT c.*,b.mapping FROM service_connector_bindings b JOIN connector_instances c ON c.workspace_id=b.workspace_id AND c.id=b.connector_id AND c.provider=b.provider WHERE b.workspace_id=$1 AND b.service_id=$2 AND b.provider=$3 AND c.mode=$4',[workspaceId,serviceId,provider,'live'])).rows[0];
  return row?{...present(row),mapping:row.mapping as Record<string,string|number>,secret:row.secret_envelope?this.vault.open(workspaceId,row.id,row.secret_envelope):{}}:null;
 });}
 async queueTest(workspaceId:string,actor:string,connectorId:string){return this.db.inWorkspace(workspaceId,async client=>{
  // Serialize admission across connector IDs so concurrent requests cannot
  // bypass the tenant queue limit. This lock does not reveal other tenants.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`connector-test:${workspaceId}`]);
  const connector=(await client.query('SELECT config_version FROM connector_instances WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,connectorId])).rows[0];
  if(!connector)throw new ConnectorStateError('not-found','Connector not found');
  const pending=await client.query("SELECT id,status FROM connector_tests WHERE workspace_id=$1 AND connector_id=$2 AND status IN ('queued','running')",[workspaceId,connectorId]);
  if(pending.rowCount)return {id:pending.rows[0].id,status:pending.rows[0].status};
  const capacity=await client.query("SELECT count(*)::int AS total FROM connector_tests WHERE workspace_id=$1 AND status IN ('queued','running')",[workspaceId]);
  if(capacity.rows[0].total>=20)throw new ConnectorStateError('capacity','Workspace connection test queue is full');
  if(!(await client.query('SELECT connector_test_admission() AS admitted')).rows[0].admitted)throw new ConnectorStateError('capacity','Connection test queue is full');
  const id=randomUUID();await client.query('INSERT INTO connector_tests(workspace_id,id,connector_id,config_version,requested_by) VALUES($1,$2,$3,$4,$5)',[workspaceId,id,connectorId,connector.config_version,actor]);
  await this.db.appendAuditInTransaction(client,workspaceId,actor,'connector.test-requested',{connectorId,testId:id,configVersion:connector.config_version});return {id,status:'queued'};
 });}
 async getTest(workspaceId:string,connectorId:string,id:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query('SELECT id,connector_id AS "connectorId",config_version AS "configVersion",status,result,created_at AS "createdAt",finished_at AS "finishedAt" FROM connector_tests WHERE workspace_id=$1 AND connector_id=$2 AND id=$3',[workspaceId,connectorId,id])).rows[0]??null);}
 async claimTest(workspaceId:string){return this.db.inWorkspace(workspaceId,async client=>{
  await client.query("UPDATE connector_tests SET status='failed',finished_at=now(),result=$1 WHERE workspace_id=$2 AND status='running' AND started_at<now()-interval '2 minutes' AND attempts>=3",[{outcome:'unavailable',capability:'connection-test',recordCount:0,errorCode:'attempts-exhausted'},workspaceId]);
  const test=(await client.query("SELECT * FROM connector_tests WHERE workspace_id=$1 AND (status='queued' OR (status='running' AND started_at<now()-interval '2 minutes')) AND attempts<3 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[workspaceId])).rows[0];
  if(!test)return null;
  await client.query("UPDATE connector_tests SET status='running',started_at=now(),attempts=attempts+1 WHERE workspace_id=$1 AND id=$2",[workspaceId,test.id]);
  const row=(await client.query('SELECT c.provider,c.mode AS current_mode,v.* FROM connector_versions v JOIN connector_instances c ON c.workspace_id=v.workspace_id AND c.id=v.connector_id WHERE v.workspace_id=$1 AND v.connector_id=$2 AND v.version=$3',[workspaceId,test.connector_id,test.config_version])).rows[0];
  let secret:Record<string,string>={};
  try{if(row.current_mode!=='off'&&row.secret_envelope)secret=this.vault.open(workspaceId,test.connector_id,row.secret_envelope);}
  catch{
   await client.query("UPDATE connector_tests SET status='failed',finished_at=now(),result=$1 WHERE workspace_id=$2 AND id=$3",[{outcome:'unavailable',capability:'connection-test',recordCount:0,errorCode:'credential-unavailable'},workspaceId,test.id]);
   await this.db.appendAuditInTransaction(client,workspaceId,'connector-worker','connector.tested',{connectorId:test.connector_id,testId:test.id,outcome:'unavailable',errorCode:'credential-unavailable'});
   return null;
  }
  return {testId:test.id,attempt:test.attempts+1,connectorId:test.connector_id,configVersion:test.config_version,provider:row.provider as Provider,mode:(row.current_mode==='off'?'off':row.mode) as string,config:row.config as Record<string,string|number>,secret};
 });}
 async finishTest(workspaceId:string,id:string,attempt:number,result:ConnectionTestResult){return this.db.inWorkspace(workspaceId,async client=>{
  const updated=await client.query("UPDATE connector_tests SET status=$1,result=$2,finished_at=now() WHERE workspace_id=$3 AND id=$4 AND attempts=$5 AND status='running' RETURNING connector_id",[['verified-read','reachable','empty'].includes(result.outcome)?'succeeded':'failed',result,workspaceId,id,attempt]);
  if(updated.rowCount)await this.db.appendAuditInTransaction(client,workspaceId,'connector-worker','connector.tested',{connectorId:updated.rows[0].connector_id,testId:id,outcome:result.outcome});
 });}
}
