import { PrometheusClient, collectSlo } from "@sentinel/connectors";
import { severity } from "@sentinel/policy";
import type { InvestigationInput, InvestigationResult } from '@sentinel/workflows';
import { SentinelDatabase } from '@sentinel/db';
export function createActivities(db: SentinelDatabase) {
 return {
  async collectEvidence(input: InvestigationInput) {
   const mapping = await db.inWorkspace(input.workspaceId,async client => {
    const incident = await client.query('SELECT id FROM incidents WHERE workspace_id=$1 AND id=$2 AND service_id=$3',[input.workspaceId,input.incidentId,input.serviceId]);
    if (!incident.rowCount) throw new Error('Incident not found');
    return (await client.query('SELECT * FROM service_slos WHERE workspace_id=$1 AND service_id=$2',[input.workspaceId,input.serviceId])).rows[0];
   });
   const saved=await db.inWorkspace(input.workspaceId,async client=>(await client.query('SELECT severity FROM incident_evidence WHERE workspace_id=$1 AND incident_id=$2',[input.workspaceId,input.incidentId])).rows[0]);
   if(saved)return {available:true,summary:`Prometheus SLI evaluated as ${saved.severity}. No production action proposed; investigation required.`};
   if(!mapping || !process.env.PROMETHEUS_URL || process.env.SENTINEL_CONFIG_WORKSPACE_ID!==input.workspaceId) return {available:false,summary:'Telemetry is not configured.'};
   const sample=await collectSlo(new PrometheusClient({url:process.env.PROMETHEUS_URL,token:process.env.PROMETHEUS_TOKEN,timeoutMs:5000}),{availabilityTarget:mapping.availability_target,latencyTargetMs:mapping.latency_target_ms,goodQuery:mapping.good_query,totalQuery:mapping.total_query,latencyQuery:mapping.latency_query});
   const sev=severity(sample);
   await db.inWorkspace(input.workspaceId,async client=>{
    const inserted=await client.query("INSERT INTO incident_evidence(workspace_id,incident_id,service_id,source,sample,severity) VALUES($1,$2,$3,'prometheus',$4,$5) ON CONFLICT DO NOTHING RETURNING incident_id",[input.workspaceId,input.incidentId,input.serviceId,sample,sev]);
    if(inserted.rowCount) await db.appendAuditInTransaction(client,input.workspaceId,'read-worker','evidence.collected',{incidentId:input.incidentId,source:'prometheus',severity:sev});
   });
   return {available:true,summary:`Prometheus SLI evaluated as ${sev}. No production action proposed; investigation required.`};
  },
  async recordInvestigation(input: InvestigationInput, result: InvestigationResult) {
   await db.inWorkspace(input.workspaceId, async client => {
    const updated = await client.query('UPDATE incidents SET state=$1 WHERE workspace_id=$2 AND id=$3 AND service_id=$4 AND state=$5 RETURNING id', [result.status,input.workspaceId,input.incidentId,input.serviceId,'investigating']);
    if (!updated.rowCount) {
     const existing = await client.query('SELECT state FROM incidents WHERE workspace_id=$1 AND id=$2 AND service_id=$3',[input.workspaceId,input.incidentId,input.serviceId]);
     if (existing.rows[0]?.state === result.status) return;
     throw new Error('Incident missing or state changed');
    }
    await db.appendAuditInTransaction(client,input.workspaceId,'read-worker','incident.investigated',{incidentId:input.incidentId,status:result.status,summary:result.summary});
   });
  }
 };
}
