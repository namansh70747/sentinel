import { readEcsMetrics } from '@sentinel/connectors/cloudwatch-ecs';
import { EcsReadClient, LokiClient, MOCK_SERVICE_ARN, MockEcsReadClient, PrometheusClient, TempoClient, assessCoverage, collectSlo, publishNtfy, simulateCloudWatch, simulateCost, simulateDr, SloReadError } from '@sentinel/connectors';
import type { Provenance, SourceName, SourceOutcome, SourceResult } from '@sentinel/contracts';
import { correlateEcsChange } from '@sentinel/engine';
import { qualifiedSeverity } from '@sentinel/policy';
import type { InvestigationInput, InvestigationResult } from '@sentinel/workflows';
import { SentinelDatabase } from '@sentinel/db';
import type { ConnectorRepository } from '@sentinel/db/connectors';
import { collectBoundLogs,collectBoundTraces,collectBoundMetrics } from '@sentinel/connectors/bound-telemetry';
import { ConnectorHttpClient,ConnectorHttpError } from '@sentinel/connectors/http';
import { InvestigationRepository,type RunIdentity } from '@sentinel/db/investigations';
import { GitHubSyncRepository } from '@sentinel/db/github-sync';
import { KubernetesReader } from '@sentinel/connectors/kubernetes';

export function readEcsMode(value = process.env.SENTINEL_ECS_MODE): 'off' | 'simulated' | 'live' {
 if (value !== 'off' && value !== 'simulated' && value !== 'live') throw new Error('SENTINEL_ECS_MODE must be off, simulated, or live');
 if (value === 'live' && !process.env.SENTINEL_READ_ROLE_ARN) throw new Error('live ECS mode requires SENTINEL_READ_ROLE_ARN');
 return value;
}

export function createActivities(db: SentinelDatabase, connections?:ConnectorRepository) {
 const runs=new InvestigationRepository(db);
 const cached=async(input:InvestigationInput,source:SourceName):Promise<SourceResult|null>=>{
  if(!input.runId)return null;
  const prior=await runs.cached(input as RunIdentity,source);
  return prior?{source,...prior,summary:'Persisted evidence reused for this investigation run.'}:null;
 };
 const write = async (input: InvestigationInput, source: SourceName, outcome: SourceOutcome, provenance: Provenance | null, detail: unknown, extras: { severity?: string; observedAt?: string | null; windowCovered?: boolean | null } = {}) => {
  if(input.runId){await runs.persist(input as RunIdentity,source,outcome,provenance,detail,extras);return;}
  await db.inWorkspace(input.workspaceId, async client => {
   const inserted = await client.query(
    `INSERT INTO incident_evidence(workspace_id,incident_id,service_id,source,sample,severity,outcome,provenance,observed_at,window_covered,detail)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING source`,
    [input.workspaceId, input.incidentId, input.serviceId, source, detail, extras.severity ?? 'sev4', outcome, provenance, extras.observedAt ?? null, extras.windowCovered ?? null, detail],
   );
   if (inserted.rowCount) await db.appendAuditInTransaction(client, input.workspaceId, 'read-worker', 'evidence.collected', { incidentId: input.incidentId, source, outcome, provenance });
  });
 };
 const result = (source: SourceName, outcome: SourceOutcome, provenance: Provenance | null, summary: string): SourceResult => ({ source, outcome, provenance, summary });
 const liveAws = async (input: InvestigationInput) => {
  const binding = await connections?.resolve(input.workspaceId,input.serviceId,'ecs',input.runId);
  if(!binding)return null;
  const {serviceArn,readRoleArn}=binding.mapping;
  if(typeof serviceArn!=='string'||typeof readRoleArn!=='string'||serviceArn!==process.env.SENTINEL_ECS_SERVICE_ARN||readRoleArn!==process.env.SENTINEL_READ_ROLE_ARN)return null;
  return {serviceArn,readRoleArn,binding,region:serviceArn.split(':')[3],accountId:serviceArn.split(':')[4]};
 };
 const awsFailure = (error: unknown): SourceOutcome =>
  error instanceof Error && /AccessDenied|Unauthorized|ExpiredToken|InvalidClientToken/.test(error.name) ? 'denied' : 'unavailable';
 const missingAws = async (input:InvestigationInput,source:SourceName) => {
  const reason='No enabled live AWS binding matches this worker’s approved target.';
  await write(input,source,'not-configured',null,{reason});
  return result(source,'not-configured',null,reason);
 };
 const redact=(value:unknown,secrets:string[]):unknown=>{
  if(typeof value==='string')return secrets.filter(Boolean).reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),value);
  if(Array.isArray(value))return value.map(item=>redact(item,secrets));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[String(redact(key,secrets)),redact(item,secrets)]));
  return value;
 };
 const boundCollect=async(input:InvestigationInput,source:'prometheus'|'loki'|'tempo'|'github'):Promise<SourceResult>=>{
  const http=new ConnectorHttpClient({deadlineAt:Date.now()+20000});
  try{
   const prior=await cached(input,source);if(prior)return prior;
   const connection=await connections!.resolve(input.workspaceId,input.serviceId,source,input.runId);
   if(!connection){await write(input,source,'not-configured',null,{reason:'No enabled workspace connection is mapped to this service.'});return result(source,'not-configured',null,'Map an enabled workspace connection to this service.');}
   const metadata={connectorId:connection.id,configVersion:connection.configVersion,collectedAt:new Date().toISOString()};
   let detail:unknown,outcome:SourceOutcome='ok',severity:string|undefined,covered:boolean|undefined,sourceObservedAt:string|undefined;
   const observedAt=connection.observedAt?.getTime()??Date.now();
   if(source==='loki'){const logs=await collectBoundLogs(connection,http,observedAt);detail={...logs,...metadata};if(!logs.lines.length)outcome='empty';}
   else if(source==='tempo'){const traces=await collectBoundTraces(connection,http,observedAt);detail={...traces,...metadata};if(!traces.traces.length)outcome='empty';}
   else if(source==='github'){
    if(!connection.secret.token){await write(input,source,'not-configured',null,{...metadata,reason:'Read credential is required.'});return result(source,'not-configured',null,'GitHub read credential is required.');}
    const observations=await new GitHubSyncRepository(db).observations(input.workspaceId,input.serviceId,connection.id,connection.configVersion,String(connection.mapping.owner),String(connection.mapping.repo),observedAt);
    const successful=observations.resources.filter(row=>row.last_success_at),failed=observations.resources.filter(row=>row.status==='failed');
    const pending=observations.changesTruncated||observations.resourcesTruncated||observations.resources.some(row=>['pending','running','partial'].includes(row.status));
    const stale=successful.some(row=>row.status!=='complete'&&observedAt-new Date(row.last_success_at).getTime()>600000);
    if(!observations.resources.length||pending)outcome='uncovered';
    else if(!successful.length)outcome=failed.length&&failed.every(row=>row.error_code==='denied')?'denied':'unavailable';
    else if(failed.length===observations.resources.length)outcome=failed.every(row=>row.error_code==='denied')?'denied':'unavailable';else if(stale)outcome='stale';else if(pending||failed.length)outcome='uncovered';else if(!observations.changes.length)outcome='empty';
    if(successful.length)sourceObservedAt=new Date(Math.max(...successful.map(row=>new Date(row.last_success_at).getTime()))).toISOString();
    detail={...metadata,...observations,collection:'persisted-provider-sync',partial:pending||failed.length>0,reason:!observations.resources.length?'Repository synchronization has not run yet.':undefined};
   }else{
    const targets=input.runId?(connection.mapping.availabilityTarget&&connection.mapping.latencyTargetMs?{availability_target:Number(connection.mapping.availabilityTarget),latency_target_ms:Number(connection.mapping.latencyTargetMs)}:null):await db.inWorkspace(input.workspaceId,async client=>(await client.query('SELECT availability_target,latency_target_ms FROM service_slos WHERE workspace_id=$1 AND service_id=$2',[input.workspaceId,input.serviceId])).rows[0]);
    if(!targets){await write(input,source,'not-configured',null,{...metadata,reason:'Service SLO targets are required.'});return result(source,'not-configured',null,'Configure service SLO targets.');}
    const metrics=await collectBoundMetrics(connection,{availabilityTarget:targets.availability_target,latencyTargetMs:targets.latency_target_ms},http,observedAt);
    const qualifies=(seconds:number,latency=false)=>metrics.coverage.find(window=>window.windowSeconds===seconds)?.inputs.filter(row=>latency?row.input==='latencyCoverageQuery':row.input!=='latencyCoverageQuery').every(row=>row.covered)??false;
    const qualified=qualifiedSeverity(metrics.sample,{fiveMinutes:qualifies(300),tenMinutes:qualifies(600,true),thirtyMinutes:qualifies(1800),oneHour:qualifies(3600),sixHours:qualifies(21600)});
    covered=metrics.coverage.every(window=>window.inputs.every(row=>row.covered));severity=qualified??'sev4';outcome=covered?'ok':'uncovered';detail={...metrics.sample,...metadata,coverage:metrics.coverage,queryWindow:metrics.queryWindow,severityQualified:qualified!==null,windowCovered:covered};
   }
   await write(input,source,outcome,'live',redact(detail,Object.values(connection.secret)),{severity,observedAt:source==='github'?sourceObservedAt??null:new Date(observedAt).toISOString(),windowCovered:covered});
   const summary=outcome==='ok'?`${source} service evidence recorded.`:outcome==='empty'?`${source} returned no observations for this service.`:outcome==='uncovered'?(source==='prometheus'?'SLI input coverage is incomplete; severity requires qualifying windows.':'GitHub synchronization is incomplete; per-capability outcomes accompany the persisted observations.'):`${source} evidence outcome is ${outcome}; review provider diagnostics.`;
   return result(source,outcome,'live',summary);
  }catch(error){const code=error instanceof ConnectorHttpError||error instanceof SloReadError?error.code:'collection-failed';const outcome=code==='denied'?'denied':code==='stale'?'stale':code==='empty'?'empty':'unavailable';await write(input,source,outcome,'live',{errorCode:code,reason:'Workspace provider read failed.'});return result(source,outcome,'live',`Workspace provider read failed (${code}).`);}
 };
 return {
  async collectKubernetes(input:InvestigationInput):Promise<SourceResult>{
   const prior=await cached(input,'kubernetes');if(prior)return prior;
   if(!input.runId)return result('kubernetes','not-configured',null,'Kubernetes is collected only in explicitly opted-in fresh runs.');
   try{
    const connection=await connections?.resolve(input.workspaceId,input.serviceId,'kubernetes',input.runId);
    if(!connection||!connection.secret.token||connection.mapping.namespace!==connection.config.namespace){await write(input,'kubernetes','not-configured',null,{reason:'No enabled frozen Kubernetes reader mapping is available.'});return result('kubernetes','not-configured',null,'Kubernetes reader is not configured for this run.');}
    const snapshot=await new KubernetesReader({endpoint:String(connection.config.endpoint),namespace:String(connection.config.namespace),certificateAuthority:connection.config.certificateAuthority===undefined?undefined:String(connection.config.certificateAuthority)},connection.secret.token).collect(String(connection.mapping.labelSelector));
    const outcome=snapshot.truncated?'uncovered':snapshot.records.length?'ok':'empty';
    await write(input,'kubernetes',outcome,'live',redact({...snapshot,connectorId:connection.id,configVersion:connection.configVersion,readSemantics:'current-state-at-collection',requestedAt:connection.observedAt?.toISOString()},Object.values(connection.secret)),{observedAt:snapshot.observedAt});
    return result('kubernetes',outcome,'live','Namespace-scoped Kubernetes context recorded with its actual collection timestamp.');
   }catch(error){const code=error instanceof ConnectorHttpError?error.code:'collection-failed',outcome=code==='denied'?'denied':'unavailable';await write(input,'kubernetes',outcome,'live',{errorCode:code,reason:'The live namespace read failed. No simulated fallback was used.'});return result('kubernetes',outcome,'live','Kubernetes context could not be collected.');}
  },
  async recordSourceFailure(input: InvestigationInput, source: SourceName) {
   await write(input, source, 'unavailable', null, { reason: 'Evidence collection failed after retries.' });
  },
  async collectPrometheus(input: InvestigationInput): Promise<SourceResult> {
   if(connections)return boundCollect(input,'prometheus');
   const mapping = await db.inWorkspace(input.workspaceId, async client => {
    const incident = await client.query('SELECT id, created_at FROM incidents WHERE workspace_id=$1 AND id=$2 AND service_id=$3', [input.workspaceId, input.incidentId, input.serviceId]);
    if (!incident.rowCount) throw new Error('Incident not found');
    return (await client.query('SELECT * FROM service_slos WHERE workspace_id=$1 AND service_id=$2', [input.workspaceId, input.serviceId])).rows[0];
   });
   if (!mapping || !process.env.PROMETHEUS_URL || process.env.SENTINEL_CONFIG_WORKSPACE_ID !== input.workspaceId) {
    await write(input, 'prometheus', 'not-configured', null, { reason: 'Telemetry is not configured.' });
    return result('prometheus', 'not-configured', null, 'Telemetry is not configured.');
   }
   const client = new PrometheusClient({ url: process.env.PROMETHEUS_URL, token: process.env.PROMETHEUS_TOKEN, timeoutMs: 5000 });
   const sample = await collectSlo(client, { availabilityTarget: mapping.availability_target, latencyTargetMs: mapping.latency_target_ms, goodQuery: mapping.good_query, totalQuery: mapping.total_query, latencyQuery: mapping.latency_query });
   let covered = false;
   let coverage: Array<ReturnType<typeof assessCoverage> & {windowSeconds:number}> = [];
   try {
    const end = Date.now() / 1000;
    const rows = await client.queryMatrix(process.env.SENTINEL_COVERAGE_QUERY || 'up{job="workload"}[6h]');
    // Multiple series require an explicit service mapping; never combine unrelated targets.
    if (rows.length === 1) {
     coverage = [300,600,1800,3600,21600].map(seconds=>({ windowSeconds: seconds, ...assessCoverage(rows[0].values,end-seconds,end) }));
     covered = coverage.every(window=>window.covered);
    }
   } catch { covered = false; }
   const qualifies=(seconds:number)=>coverage.find(window=>window.windowSeconds===seconds)?.covered??false;
   const sev = qualifiedSeverity(sample,{fiveMinutes:qualifies(300),tenMinutes:qualifies(600),thirtyMinutes:qualifies(1800),oneHour:qualifies(3600),sixHours:qualifies(21600)});
   const outcome = covered ? 'ok' : 'uncovered';
   await write(input, 'prometheus', outcome, 'live', { ...sample, windowCovered: covered, coverage, severityQualified: sev!==null }, { severity: sev??'sev4', observedAt: new Date().toISOString(), windowCovered: covered });
   return result('prometheus', outcome, 'live', sev ? `Prometheus SLI evaluated as ${sev} from qualifying windows. No production action proposed.` : 'Prometheus SLI coverage is incomplete. Severity is not yet qualified.');
  },
  async collectEcs(input: InvestigationInput): Promise<SourceResult> {
   const prior=await cached(input,'ecs');if(prior)return prior;
   if(connections){
    const target=await liveAws(input);
    if(!target)return missingAws(input,'ecs');
    try{
     const observation=await new EcsReadClient(target).observe(target.serviceArn);
     await write(input,'ecs','ok','live',{...observation,configVersion:target.binding.configVersion},{observedAt:observation.observedAt});
     return result('ecs','ok','live','Live ECS observation recorded.');
    }catch(error){
     const outcome=awsFailure(error);
     await write(input,'ecs',outcome,'live',{serviceArn:target.serviceArn,reason:outcome});
     return result('ecs',outcome,'live','ECS service read failed.');
    }
   }

   let mode: 'off' | 'simulated' | 'live';
   try { mode = readEcsMode(); }
   catch (error) {
    const summary = error instanceof Error ? error.message : 'ECS mode is invalid';
    await write(input, 'ecs', 'unavailable', null, { reason: summary });
    return result('ecs', 'unavailable', null, summary);
   }
   const service = await db.inWorkspace(input.workspaceId, async client => (await client.query('SELECT resource_arn, account_id, region, created_at FROM services WHERE workspace_id=$1 AND id=$2', [input.workspaceId, input.serviceId])).rows[0]);
   const opened = await db.inWorkspace(input.workspaceId, async client => (await client.query('SELECT created_at FROM incidents WHERE workspace_id=$1 AND id=$2', [input.workspaceId, input.incidentId])).rows[0]);
   if (mode === 'off') {
    await write(input, 'ecs', 'not-configured', null, { reason: 'ECS mode is off.' });
    return result('ecs', 'not-configured', null, 'ECS mode is off.');
   }
   try {
    const observation = mode === 'simulated'
     ? await new MockEcsReadClient().observe(service?.resource_arn ?? MOCK_SERVICE_ARN)
     : await new EcsReadClient({ region: service.region, accountId: service.account_id, readRoleArn: process.env.SENTINEL_READ_ROLE_ARN! }).observe(service.resource_arn);
    const provenance: Provenance = mode === 'simulated' ? 'simulated' : 'live';
    await write(input, 'ecs', 'ok', provenance, observation, { observedAt: observation.observedAt });
    if (service&&!input.runId) {
     await db.inWorkspace(input.workspaceId, async client => {
      await client.query('INSERT INTO ecs_evidence(workspace_id,incident_id,service_id,observation,provenance) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [input.workspaceId, input.incidentId, input.serviceId, observation, provenance]);
      const prom = (await client.query("SELECT severity FROM incident_evidence WHERE workspace_id=$1 AND incident_id=$2 AND source='prometheus'", [input.workspaceId, input.incidentId])).rows[0];
      const hypothesis = correlateEcsChange({ ...observation, provenance }, prom?.severity ?? 'sev4', Date.now(), opened?.created_at?.toISOString?.() ?? new Date().toISOString());
      await client.query('INSERT INTO change_hypotheses(workspace_id,incident_id,service_id,hypothesis) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [input.workspaceId, input.incidentId, input.serviceId, hypothesis]);
     });
    }
    return result('ecs', 'ok', provenance, provenance === 'simulated' ? 'Simulated ECS observation is a lead, not a cause.' : 'Live ECS observation recorded.');
   } catch (error) {
    const summary = error instanceof Error ? error.message : 'ECS read failed';
    await write(input, 'ecs', 'unavailable', mode === 'simulated' ? 'simulated' : 'live', { reason: summary });
    return result('ecs', 'unavailable', mode === 'simulated' ? 'simulated' : 'live', summary);
   }
  },
  async collectLoki(input: InvestigationInput): Promise<SourceResult> {
   if(connections)return boundCollect(input,'loki');
   if (!process.env.LOKI_URL) { await write(input, 'loki', 'not-configured', null, { reason: 'Loki is not configured.' }); return result('loki', 'not-configured', null, 'Loki is not configured.'); }
   try {
    const end = Date.now();
    const lines = await new LokiClient(process.env.LOKI_URL).queryRange('{job="workload"}', String((end - 15 * 60_000) * 1_000_000), String(end * 1_000_000));
    if (!lines.length) { await write(input, 'loki', 'unavailable', 'live', { reason: 'No log lines.' }); return result('loki', 'unavailable', 'live', 'No log lines.'); }
    await write(input, 'loki', 'ok', 'live', { lines }, { observedAt: new Date().toISOString() });
    return result('loki', 'ok', 'live', 'Loki lines recorded.');
   } catch (error) {
    const summary = error instanceof Error ? error.message : 'Loki read failed';
    await write(input, 'loki', 'unavailable', 'live', { reason: summary });
    return result('loki', 'unavailable', 'live', summary);
   }
  },
  async collectTempo(input: InvestigationInput): Promise<SourceResult> {
   if(connections)return boundCollect(input,'tempo');
   if (!process.env.TEMPO_URL) { await write(input, 'tempo', 'not-configured', null, { reason: 'Tempo is not configured.' }); return result('tempo', 'not-configured', null, 'Tempo is not configured.'); }
   try {
    const end = Math.floor(Date.now() / 1000);
    const traces = await new TempoClient(process.env.TEMPO_URL).search('{resource.service.name="workload"}', end - 900, end);
    if (!traces.length) { await write(input, 'tempo', 'unavailable', 'live', { reason: 'No traces.' }); return result('tempo', 'unavailable', 'live', 'No traces.'); }
    await write(input, 'tempo', 'ok', 'live', { traces }, { observedAt: new Date().toISOString() });
    return result('tempo', 'ok', 'live', 'Tempo traces recorded.');
   } catch (error) {
    const summary = error instanceof Error ? error.message : 'Tempo read failed';
    await write(input, 'tempo', 'unavailable', 'live', { reason: summary });
    return result('tempo', 'unavailable', 'live', summary);
   }
  },
  async collectGithub(input: InvestigationInput): Promise<SourceResult> {
   if(connections)return boundCollect(input,'github');
   if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    await write(input, 'github', 'not-configured', null, { reason: 'GitHub is not configured.' });
    return result('github', 'not-configured', null, 'GitHub is not configured.');
   }
   const { GitHubReadClient } = await import('@sentinel/connectors');
   const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
   try {
    const commits = await new GitHubReadClient(process.env.GITHUB_TOKEN).commits(owner, repo);
    await write(input, 'github', 'ok', 'live', { commits: commits.slice(0, 20) }, { observedAt: new Date().toISOString() });
    return result('github', 'ok', 'live', 'GitHub commits recorded.');
   } catch (error) {
    const summary = error instanceof Error ? error.message : 'GitHub read failed';
    await write(input, 'github', 'unavailable', 'live', { reason: summary });
    return result('github', 'unavailable', 'live', summary);
   }
  },
  async collectCloudwatch(input: InvestigationInput): Promise<SourceResult> {
   const prior=await cached(input,'cloudwatch');if(prior)return prior;
   if(connections){
    const target=await liveAws(input);
    if(!target)return missingAws(input,'cloudwatch');
    try{
     const observation=await readEcsMetrics(target.serviceArn,target.readRoleArn,target.binding.observedAt??new Date());
     const populated=observation.metrics.filter(metric=>metric.points.length);
     const outcome=observation.metrics.some(metric=>metric.partial)?'uncovered':populated.length===2?'ok':populated.length?'uncovered':'empty';
     const timestamps=populated.flatMap(metric=>metric.points.map(point=>point.timestamp)).sort();
     await write(input,'cloudwatch',outcome,'live',{...observation,configVersion:target.binding.configVersion},{observedAt:timestamps.at(-1)??null});
     return result('cloudwatch',outcome,'live','CloudWatch metric read completed.');
    }catch(error){
     const outcome=awsFailure(error);
     await write(input,'cloudwatch',outcome,'live',{serviceArn:target.serviceArn,reason:outcome});
     return result('cloudwatch',outcome,'live','CloudWatch metric read failed.');
    }
   }

   const detail = simulateCloudWatch('000000000000');
   await write(input, 'cloudwatch', 'ok', 'simulated', detail);
   return result('cloudwatch', 'ok', 'simulated', 'Simulated CloudWatch is not a measurement.');
  },
  async collectCost(input: InvestigationInput): Promise<SourceResult> {
   const prior=await cached(input,'cost');if(prior)return prior;
   if(connections)return missingAws(input,'cost');
   const detail = simulateCost('000000000000');
   await write(input, 'cost', 'ok', 'simulated', detail);
   return result('cost', 'ok', 'simulated', 'Simulated cost is not a bill.');
  },
  async collectDr(input: InvestigationInput): Promise<SourceResult> {
   const prior=await cached(input,'dr');if(prior)return prior;
   if(connections)return missingAws(input,'dr');
   const detail = simulateDr('000000000000');
   await write(input, 'dr', 'ok', 'simulated', detail);
   return result('dr', 'ok', 'simulated', 'Restore was not attempted.');
  },
  async recordInvestigation(input: InvestigationInput, outcome: InvestigationResult) {
   if(input.runId){await runs.finish(input as RunIdentity,outcome.status,outcome.summary);return;}
   await db.inWorkspace(input.workspaceId, async client => {
    const prom = (await client.query("SELECT severity, outcome, detail FROM incident_evidence WHERE workspace_id=$1 AND incident_id=$2 AND source='prometheus'", [input.workspaceId, input.incidentId])).rows[0];
    const severity = prom && (prom.outcome === 'ok' || (prom.outcome === 'uncovered' && prom.detail?.severityQualified===true)) ? prom.severity : null;
    const updated = await client.query('UPDATE incidents SET state=$1, severity=COALESCE($2, severity) WHERE workspace_id=$3 AND id=$4 AND service_id=$5 AND state=$6 RETURNING id', [outcome.status, severity, input.workspaceId, input.incidentId, input.serviceId, 'investigating']);
    if (!updated.rowCount) {
     const existing = await client.query('SELECT state FROM incidents WHERE workspace_id=$1 AND id=$2 AND service_id=$3', [input.workspaceId, input.incidentId, input.serviceId]);
     if (existing.rows[0]?.state === outcome.status) return;
     throw new Error('Incident missing or state changed');
    }
    await db.appendAuditInTransaction(client, input.workspaceId, 'read-worker', 'incident.investigated', { incidentId: input.incidentId, status: outcome.status, summary: outcome.summary });
   });
  },
  async notifyNtfy(input: InvestigationInput, outcome: InvestigationResult) {
   // Workspace mode must use the forthcoming approved subscription ledger;
   // process-wide notification destinations are never a fallback.
   if(connections)return;
   if (!process.env.NTFY_URL || !process.env.NTFY_TOPIC) return;
   await publishNtfy(process.env.NTFY_URL, process.env.NTFY_TOPIC, `incident ${input.incidentId} ${outcome.status}`);
  },
 };
}
