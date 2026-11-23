import { randomUUID } from 'node:crypto';
import type { SentinelDatabase } from '../index';
import type { ConnectorRepository } from './connectors';
import { ConnectorStateError } from './connectors';
import { KubernetesReader } from '@sentinel/connectors/kubernetes';
import { ConnectorHttpError } from '@sentinel/connectors/http';

type Connection=NonNullable<Awaited<ReturnType<ConnectorRepository['resolve']>>>;
export class OperationalFindingsRepository {
 constructor(private readonly db:SentinelDatabase){}
 async read(workspaceId:string,serviceId:string){return this.db.inWorkspace(workspaceId,async client=>{
  const latest=(await client.query("SELECT * FROM operational_findings WHERE workspace_id=$1 AND service_id=$2 AND provider='kubernetes' ORDER BY collected_at DESC,id DESC LIMIT 1",[workspaceId,serviceId])).rows[0]??null;
  const history=(await client.query("SELECT id,connector_id,config_version,outcome,provenance,observed_at,collected_at FROM operational_findings WHERE workspace_id=$1 AND service_id=$2 AND provider='kubernetes' ORDER BY collected_at DESC,id DESC LIMIT 20",[workspaceId,serviceId])).rows;
  return {latest,history};
 });}
 async collect(workspaceId:string,actor:string,serviceId:string,connection:Connection){
  if(connection.provider!=='kubernetes'||connection.mapping.namespace!==connection.config.namespace||!connection.secret.token)throw new ConnectorStateError('not-found','Map a Kubernetes connection with a current reader credential and matching namespace first');
  return this.db.inWorkspace(workspaceId,async client=>{
   const admitted=(await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,5293)) AS admitted',[workspaceId+':'+serviceId])).rows[0].admitted;
   if(!admitted)throw new ConnectorStateError('capacity','A service observation is already in progress');
   const startedAt=new Date().toISOString();let outcome='ok',detail:unknown,observedAt:string|null=null;
   try{
    const snapshot=await new KubernetesReader({endpoint:String(connection.config.endpoint),namespace:String(connection.config.namespace),certificateAuthority:connection.config.certificateAuthority===undefined?undefined:String(connection.config.certificateAuthority)},connection.secret.token).collect(String(connection.mapping.labelSelector));
    observedAt=snapshot.observedAt;outcome=snapshot.truncated?'partial':snapshot.records.length?'ok':'empty';detail={...snapshot,startedAt};
   }catch(error){outcome=error instanceof ConnectorHttpError&&error.code==='denied'?'denied':'unavailable';detail={startedAt,errorCode:error instanceof ConnectorHttpError?error.code:'collection-failed',reason:'The live Kubernetes read failed. No mock fallback was used.'};}
   const row=(await client.query("INSERT INTO operational_findings(workspace_id,id,service_id,connector_id,config_version,provider,outcome,provenance,observed_at,mapping,detail) VALUES($1,$2,$3,$4,$5,'kubernetes',$6,'live',$7,$8,$9) RETURNING *",[workspaceId,randomUUID(),serviceId,connection.id,connection.configVersion,outcome,observedAt,connection.mapping,detail])).rows[0];
   await this.db.appendAuditInTransaction(client,workspaceId,actor,'kubernetes.observation-collected',{serviceId,connectorId:connection.id,configVersion:connection.configVersion,observationId:row.id,outcome});
   return row;
  });
 }
}
