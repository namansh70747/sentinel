import { buildIncidentAdvisory } from '@sentinel/connectors/incident-recommendation';
import { randomUUID } from 'node:crypto';
import type { SentinelDatabase } from '../index';
import type { SourceName,SourceOutcome,Provenance } from '@sentinel/contracts';
import { ConnectorStateError } from './connectors';

export interface RunIdentity {workspaceId:string;incidentId:string;serviceId:string;runId:string}
export interface InvestigationRun {workspace_id:string;id:string;incident_id:string;service_id:string;status:'queued'|'running'|'advised'|'escalated'|'failed';requested_by:string;summary:string|null;observed_at:Date;created_at:Date;finished_at:Date|null;advisory:ReturnType<typeof buildIncidentAdvisory>|null;advisory_model_result?:{revision?:import('@sentinel/connectors/incident-recommendation').ModelIncidentAdvisory|null}|null}
interface Attempt {source:SourceName;id:string;connector_id:string|null;config_version:number|null;mapping:Record<string,string|number>}
interface Envelope {workspace_id:string;run_id:string;incident_id:string;service_id:string;source:SourceName;attempt_id:string;outcome:SourceOutcome;provenance:Provenance|null;severity:string;detail:unknown;observed_at:Date|null;collected_at:Date;window_covered:boolean|null}
const sources:SourceName[]=['prometheus','ecs','loki','tempo','github','cloudwatch','cost','dr'];
export class InvestigationRepository {
 constructor(private readonly db:SentinelDatabase){}
 async list(workspaceId:string,incidentId:string){return this.db.inWorkspace(workspaceId,async client=>{
  if(!(await client.query('SELECT 1 FROM incidents WHERE workspace_id=$1 AND id=$2',[workspaceId,incidentId])).rowCount)throw new ConnectorStateError('not-found','Incident not found');
  return (await client.query<InvestigationRun>('SELECT * FROM investigation_runs WHERE workspace_id=$1 AND incident_id=$2 ORDER BY created_at DESC LIMIT 50',[workspaceId,incidentId])).rows;
 });}
 async create(workspaceId:string,incidentId:string,actor:string){return this.db.inWorkspace(workspaceId,async client=>{
  await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[workspaceId]);
  const incident=(await client.query('SELECT service_id FROM incidents WHERE workspace_id=$1 AND id=$2',[workspaceId,incidentId])).rows[0];
  if(!incident)throw new ConnectorStateError('not-found','Incident not found');
  const pending=await client.query("SELECT count(*)::int AS total FROM investigation_runs WHERE workspace_id=$1 AND status IN ('queued','running')",[workspaceId]);
  if(pending.rows[0].total>=10)throw new ConnectorStateError('capacity','Workspace investigation queue is full');
  const id=randomUUID();
  const run=(await client.query('INSERT INTO investigation_runs(workspace_id,id,incident_id,service_id,requested_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[workspaceId,id,incidentId,incident.service_id,actor])).rows[0];
  for(const source of [...sources,'kubernetes'] as SourceName[]){
   const binding=(await client.query("SELECT b.mapping,c.id,c.config_version FROM service_connector_bindings b JOIN connector_instances c ON c.workspace_id=b.workspace_id AND c.id=b.connector_id AND c.provider=b.provider WHERE b.workspace_id=$1 AND b.service_id=$2 AND b.provider=$3 AND c.mode='live'",[workspaceId,incident.service_id,['cloudwatch','cost','dr'].includes(source)?'ecs':source])).rows[0];
   if(source==='kubernetes'&&!binding)continue;
   let mapping=binding?.mapping??{};
   if(source==='prometheus'){
    const targets=(await client.query('SELECT availability_target,latency_target_ms FROM service_slos WHERE workspace_id=$1 AND service_id=$2',[workspaceId,incident.service_id])).rows[0];
    if(targets)mapping={...mapping,availabilityTarget:targets.availability_target,latencyTargetMs:targets.latency_target_ms};
   }
   await client.query('INSERT INTO investigation_source_attempts(workspace_id,run_id,source,id,connector_id,config_version,mapping) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,id,source,randomUUID(),binding?.id??null,binding?.config_version??null,mapping]);
  }
  await this.db.appendAuditInTransaction(client,workspaceId,actor,'investigation.requested',{runId:id,incidentId,serviceId:incident.service_id});return run;
 });}
 async get(workspaceId:string,id:string){return this.db.inWorkspace(workspaceId,async client=>{
  const run=(await client.query<InvestigationRun>('SELECT * FROM investigation_runs WHERE workspace_id=$1 AND id=$2',[workspaceId,id])).rows[0];if(!run)return null;
  const attempts=(await client.query<Attempt>('SELECT source,id,connector_id,config_version,mapping FROM investigation_source_attempts WHERE workspace_id=$1 AND run_id=$2 ORDER BY source',[workspaceId,id])).rows;
  const evidence=(await client.query<Envelope>('SELECT * FROM investigation_evidence WHERE workspace_id=$1 AND run_id=$2 ORDER BY source',[workspaceId,id])).rows;
  const legacyReferences=(await client.query("SELECT source,observed_at,'legacy' AS verification FROM incident_evidence WHERE workspace_id=$1 AND incident_id=$2",[workspaceId,run.incident_id])).rows;
  const modelResult=run.advisory_model_result;
  return {...run,advisory:modelResult?.revision??run.advisory,attempts,evidence,legacyReferences};
 });}
 async cached(input:RunIdentity,source:SourceName){return this.db.inWorkspace(input.workspaceId,async client=>(await client.query('SELECT outcome,provenance FROM investigation_evidence WHERE workspace_id=$1 AND run_id=$2 AND incident_id=$3 AND service_id=$4 AND source=$5',[input.workspaceId,input.runId,input.incidentId,input.serviceId,source])).rows[0] as {outcome:SourceOutcome;provenance:Provenance|null}|undefined);}
 async persist(input:RunIdentity,source:SourceName,outcome:SourceOutcome,provenance:Provenance|null,detail:unknown,extras:{severity?:string;observedAt?:string|null;windowCovered?:boolean|null}={}){
  return this.db.inWorkspace(input.workspaceId,async client=>{
   const run=(await client.query('SELECT status FROM investigation_runs WHERE workspace_id=$1 AND id=$2 AND incident_id=$3 AND service_id=$4 FOR UPDATE',[input.workspaceId,input.runId,input.incidentId,input.serviceId])).rows[0];
   if(!run)throw new ConnectorStateError('not-found','Investigation not found');
   if(!['queued','running'].includes(run.status)){
    const prior=await client.query('SELECT 1 FROM investigation_evidence WHERE workspace_id=$1 AND run_id=$2 AND source=$3',[input.workspaceId,input.runId,source]);
    if(prior.rowCount)return false;
    throw new ConnectorStateError('version-conflict','Investigation already completed');
   }
   const inserted=await client.query(`INSERT INTO investigation_evidence(workspace_id,run_id,incident_id,service_id,source,attempt_id,outcome,provenance,severity,detail,observed_at,window_covered)
    SELECT $1,$2,$3,$4,$5,a.id,$6,$7,$8,$9,$10,$11 FROM investigation_source_attempts a WHERE a.workspace_id=$1 AND a.run_id=$2 AND a.source=$5 ON CONFLICT DO NOTHING RETURNING source`,[input.workspaceId,input.runId,input.incidentId,input.serviceId,source,outcome,provenance,extras.severity??'sev4',detail,extras.observedAt??null,extras.windowCovered??null]);
   if(inserted.rowCount)await this.db.appendAuditInTransaction(client,input.workspaceId,'read-worker','investigation.evidence-collected',{runId:input.runId,incidentId:input.incidentId,source,outcome,provenance});
   else if(!(await client.query('SELECT 1 FROM investigation_evidence WHERE workspace_id=$1 AND run_id=$2 AND incident_id=$3 AND service_id=$4 AND source=$5',[input.workspaceId,input.runId,input.incidentId,input.serviceId,source])).rowCount)throw new ConnectorStateError('not-found','Investigation source attempt not found');
   return Boolean(inserted.rowCount);
  });
 }
 async finish(input:RunIdentity,status:'advised'|'escalated'|'failed',summary:string){return this.db.inWorkspace(input.workspaceId,async client=>{
  const run=(await client.query('SELECT status FROM investigation_runs WHERE workspace_id=$1 AND id=$2 AND incident_id=$3 AND service_id=$4 FOR UPDATE',[input.workspaceId,input.runId,input.incidentId,input.serviceId])).rows[0];
  if(!run)throw new ConnectorStateError('not-found','Investigation not found');
  if(!['queued','running'].includes(run.status))return;
  {
   // A timed-out activity may never return its result. Close every persisted
   // attempt before closing the run; late activity writes cannot replace these.
   const missing=await client.query(`INSERT INTO investigation_evidence(workspace_id,run_id,incident_id,service_id,source,attempt_id,outcome,provenance,severity,detail)
    SELECT a.workspace_id,a.run_id,$3,$4,a.source,a.id,'unavailable',NULL,'sev4',$5 FROM investigation_source_attempts a
    WHERE a.workspace_id=$1 AND a.run_id=$2 AND NOT EXISTS(SELECT 1 FROM investigation_evidence e WHERE e.workspace_id=a.workspace_id AND e.run_id=a.run_id AND e.source=a.source)
    ON CONFLICT DO NOTHING RETURNING source`,[input.workspaceId,input.runId,input.incidentId,input.serviceId,{reason:'Source activity did not persist an observation before investigation completion.',errorCode:'activity-exhausted'}]);
   for(const row of missing.rows)await this.db.appendAuditInTransaction(client,input.workspaceId,'read-worker','investigation.evidence-collected',{runId:input.runId,incidentId:input.incidentId,source:row.source,outcome:'unavailable',provenance:null});
  }
  const evidence=(await client.query("SELECT source,outcome,provenance,attempt_id,severity FROM investigation_evidence WHERE workspace_id=$1 AND run_id=$2",[input.workspaceId,input.runId])).rows;
  const prom=evidence.find(item=>item.source==='prometheus');
  if(status==='advised'&&!(prom?.provenance==='live'&&['ok','uncovered'].includes(prom.outcome))){
   status='escalated';
   summary='Service health is incomplete because live request-health evidence is unavailable.';
  }
  const advisory=buildIncidentAdvisory(status,evidence);
  const updated=await client.query("UPDATE investigation_runs SET status=$1,summary=$2,finished_at=now(),advisory=$7 WHERE workspace_id=$3 AND id=$4 AND incident_id=$5 AND service_id=$6 AND status IN ('queued','running') RETURNING id",[status,summary.slice(0,2000),input.workspaceId,input.runId,input.incidentId,input.serviceId,advisory]);
  if(updated.rowCount){
   await this.db.appendAuditInTransaction(client,input.workspaceId,'read-worker','investigation.completed',{runId:input.runId,incidentId:input.incidentId,status});
   // This records publishing intent only. The separate communication worker
   // owns all external delivery; its unique event key makes retries harmless.
   await client.query(`WITH destinations AS (
    SELECT s.id,row_number() OVER(ORDER BY s.id) AS position FROM notification_subscriptions s
    JOIN connector_instances c ON c.workspace_id=s.workspace_id AND c.id=s.connector_id
    WHERE s.workspace_id=$1 AND s.service_id=$2 AND s.enabled AND c.mode='live' AND c.config_version=s.config_version LIMIT 100
   ), capacity AS (SELECT count(*) AS pending FROM notification_deliveries WHERE workspace_id=$1 AND status IN ('queued','sending'))
   INSERT INTO notification_deliveries(workspace_id,id,subscription_id,event_key,message,status,error_code,finished_at)
   SELECT $1,gen_random_uuid(),d.id,$3,$4,CASE WHEN capacity.pending+d.position<=200 THEN 'queued' ELSE 'failed' END,
    CASE WHEN capacity.pending+d.position<=200 THEN NULL ELSE 'queue-capacity' END,
    CASE WHEN capacity.pending+d.position<=200 THEN NULL ELSE now() END
   FROM destinations d CROSS JOIN capacity WHERE true ON CONFLICT(workspace_id,subscription_id,event_key) DO NOTHING`,[input.workspaceId,input.serviceId,`investigation:${input.runId}`,`Sentinel incident ${input.incidentId}: investigation ${input.runId} ${status}.`]);
  }
 });}
}
