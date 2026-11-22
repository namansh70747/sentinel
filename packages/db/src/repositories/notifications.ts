import { randomUUID } from 'node:crypto';
import type { SentinelDatabase } from '../index';
import type { SecretVault } from '@sentinel/connectors/secrets';
import { ConnectorStateError } from './connectors';
type DeliveryStatus='sent'|'confirmed'|'unknown'|'failed';
export class NotificationRepository {
 constructor(private readonly db:SentinelDatabase,private readonly vault:SecretVault){}
 async subscribe(workspaceId:string,actor:string,input:{serviceId:string;connectorId:string;expectedVersion:number;destinationLabel:string;approvedTestDestination:boolean}){
  if(input.approvedTestDestination!==true||!input.destinationLabel.trim()||input.destinationLabel.length>160)throw new Error('An explicit test destination approval is required');
  return this.db.inWorkspace(workspaceId,async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`notification-subscribe:${workspaceId}`]);
   const existing=await client.query('SELECT id FROM notification_subscriptions WHERE workspace_id=$1 AND service_id=$2 AND connector_id=$3 AND config_version=$4',[workspaceId,input.serviceId,input.connectorId,input.expectedVersion]);
   const count=(await client.query('SELECT count(*)::int AS total FROM notification_subscriptions WHERE workspace_id=$1',[workspaceId])).rows[0].total;
   if(count>=100&&!existing.rowCount)throw new ConnectorStateError('capacity','Workspace subscription limit reached');
   const connector=(await client.query('SELECT provider,config_version,mode FROM connector_instances WHERE workspace_id=$1 AND id=$2 FOR SHARE',[workspaceId,input.connectorId])).rows[0];
   if(!connector||!['ntfy','slack'].includes(connector.provider)||connector.mode!=='live')throw new ConnectorStateError('not-found','Enabled communication connector not found');
   if(connector.config_version!==input.expectedVersion)throw new ConnectorStateError('version-conflict','Connection changed; review its destination again');
   if(!(await client.query('SELECT 1 FROM services WHERE workspace_id=$1 AND id=$2',[workspaceId,input.serviceId])).rowCount)throw new ConnectorStateError('not-found','Service not found');
   const id=randomUUID();const row=(await client.query('INSERT INTO notification_subscriptions(workspace_id,id,service_id,connector_id,config_version,destination_label,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace_id,service_id,connector_id,config_version) DO UPDATE SET enabled=true,destination_label=EXCLUDED.destination_label,approved_by=EXCLUDED.approved_by,approved_at=now() RETURNING *',[workspaceId,id,input.serviceId,input.connectorId,input.expectedVersion,input.destinationLabel.trim(),actor])).rows[0];
   await this.db.appendAuditInTransaction(client,workspaceId,actor,'notification.destination-approved',{subscriptionId:row.id,connectorId:input.connectorId,configVersion:input.expectedVersion,serviceId:input.serviceId});return row;
  });
 }
 async subscriptions(workspaceId:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query('SELECT s.*,c.provider,c.mode,c.config_version AS current_version FROM notification_subscriptions s JOIN connector_instances c ON c.workspace_id=s.workspace_id AND c.id=s.connector_id WHERE s.workspace_id=$1 ORDER BY s.approved_at DESC LIMIT 100',[workspaceId])).rows);}
 async disable(workspaceId:string,actor:string,id:string){return this.db.inWorkspace(workspaceId,async client=>{
  if(!(await client.query('UPDATE notification_subscriptions SET enabled=false WHERE workspace_id=$1 AND id=$2 RETURNING id',[workspaceId,id])).rowCount)throw new ConnectorStateError('not-found','Subscription not found');
  await this.db.appendAuditInTransaction(client,workspaceId,actor,'notification.subscription-disabled',{subscriptionId:id});
 });}
 async queueTest(workspaceId:string,actor:string,subscriptionId:string){return this.db.inWorkspace(workspaceId,async client=>{
  await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[workspaceId]);
  const subscription=(await client.query('SELECT s.* FROM notification_subscriptions s JOIN connector_instances c ON c.workspace_id=s.workspace_id AND c.id=s.connector_id WHERE s.workspace_id=$1 AND s.id=$2 AND s.enabled AND c.mode=$3 AND c.config_version=s.config_version',[workspaceId,subscriptionId,'live'])).rows[0];
  if(!subscription)throw new ConnectorStateError('not-found','Approved current destination not found');
  const count=(await client.query("SELECT count(*)::int AS total FROM notification_deliveries WHERE workspace_id=$1 AND status IN ('queued','sending')",[workspaceId])).rows[0].total;
  if(count>=20)throw new ConnectorStateError('capacity','Workspace delivery queue is full');
  const id=randomUUID();await client.query('INSERT INTO notification_deliveries(workspace_id,id,subscription_id,event_key,message) VALUES($1,$2,$3,$4,$5)',[workspaceId,id,subscriptionId,`test:${id}`,`Sentinel approved local/test destination verification ${id}`]);
  await this.db.appendAuditInTransaction(client,workspaceId,actor,'notification.test-requested',{subscriptionId,deliveryId:id});return {id,status:'queued'};
 });}
 async history(workspaceId:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query('SELECT d.*,s.destination_label,c.provider FROM notification_deliveries d JOIN notification_subscriptions s ON s.workspace_id=d.workspace_id AND s.id=d.subscription_id JOIN connector_instances c ON c.workspace_id=s.workspace_id AND c.id=s.connector_id WHERE d.workspace_id=$1 ORDER BY d.created_at DESC LIMIT 100',[workspaceId])).rows);}
 async claim(workspaceId:string){return this.db.inWorkspace(workspaceId,async client=>{
  const stale=await client.query("UPDATE notification_deliveries SET status='unknown',error_code='worker-interrupted',finished_at=now() WHERE workspace_id=$1 AND status='sending' AND started_at<now()-interval '2 minutes' RETURNING id,attempt_id",[workspaceId]);
  for(const row of stale.rows){await client.query("UPDATE notification_attempts SET status='unknown',error_code='worker-interrupted',finished_at=now() WHERE workspace_id=$1 AND delivery_id=$2 AND id=$3 AND status='started'",[workspaceId,row.id,row.attempt_id]);await this.db.appendAuditInTransaction(client,workspaceId,'communication-worker','notification.unknown',{deliveryId:row.id,errorCode:'worker-interrupted'});}
  const delivery=(await client.query("SELECT * FROM notification_deliveries WHERE workspace_id=$1 AND status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[workspaceId])).rows[0];if(!delivery)return null;
  const connection=(await client.query('SELECT s.enabled,c.mode,c.config_version AS current_version,c.provider,v.config,v.secret_envelope,s.config_version FROM notification_subscriptions s JOIN connector_instances c ON c.workspace_id=s.workspace_id AND c.id=s.connector_id JOIN connector_versions v ON v.workspace_id=s.workspace_id AND v.connector_id=s.connector_id AND v.version=s.config_version WHERE s.workspace_id=$1 AND s.id=$2',[workspaceId,delivery.subscription_id])).rows[0];
  let secret:Record<string,string>={};let invalid=!connection?.enabled||connection.mode!=='live'||connection.current_version!==connection.config_version;
  if(!invalid){try{const subscription=(await client.query('SELECT connector_id FROM notification_subscriptions WHERE workspace_id=$1 AND id=$2',[workspaceId,delivery.subscription_id])).rows[0];secret=connection.secret_envelope?this.vault.open(workspaceId,subscription.connector_id,connection.secret_envelope):{};}catch{invalid=true;}}
  if(invalid){await client.query("UPDATE notification_deliveries SET status='failed',error_code='destination-approval-invalid',finished_at=now() WHERE workspace_id=$1 AND id=$2",[workspaceId,delivery.id]);await this.db.appendAuditInTransaction(client,workspaceId,'communication-worker','notification.failed',{deliveryId:delivery.id,errorCode:'destination-approval-invalid'});return null;}
  const attemptId=randomUUID();await client.query("UPDATE notification_deliveries SET status='sending',started_at=now(),attempt_id=$1 WHERE workspace_id=$2 AND id=$3",[attemptId,workspaceId,delivery.id]);
  await client.query("INSERT INTO notification_attempts(workspace_id,delivery_id,id,status) VALUES($1,$2,$3,'started')",[workspaceId,delivery.id,attemptId]);
  return {workspaceId,deliveryId:delivery.id,attemptId,message:delivery.message as string,provider:connection.provider as 'ntfy'|'slack',config:connection.config as Record<string,string>,secret};
 });}
 async finish(workspaceId:string,deliveryId:string,attemptId:string,result:{status:DeliveryStatus;errorCode?:string;messageId?:string}){return this.db.inWorkspace(workspaceId,async client=>{
  const updated=await client.query("UPDATE notification_deliveries SET status=$1,error_code=$2,provider_message_id=$3,finished_at=now() WHERE workspace_id=$4 AND id=$5 AND attempt_id=$6 AND status='sending' RETURNING id",[result.status,result.errorCode??null,result.messageId??null,workspaceId,deliveryId,attemptId]);
  if(!updated.rowCount)return;
  await client.query("UPDATE notification_attempts SET status=$1,error_code=$2,finished_at=now() WHERE workspace_id=$3 AND delivery_id=$4 AND id=$5 AND status='started'",[result.status,result.errorCode??null,workspaceId,deliveryId,attemptId]);
  await this.db.appendAuditInTransaction(client,workspaceId,'communication-worker',`notification.${result.status}`,{deliveryId,attemptId,errorCode:result.errorCode??null});
 });}
}
