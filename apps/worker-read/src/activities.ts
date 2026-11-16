import { EcsReadClient, LokiClient, MOCK_SERVICE_ARN, MockEcsReadClient, PrometheusClient, TempoClient, assessCoverage, collectSlo, publishNtfy, simulateCloudWatch, simulateCost, simulateDr } from '@sentinel/connectors';
import type { Provenance, SourceName, SourceOutcome, SourceResult } from '@sentinel/contracts';
import { correlateEcsChange } from '@sentinel/engine';
import { severity } from '@sentinel/policy';
import type { InvestigationInput, InvestigationResult } from '@sentinel/workflows';
import { SentinelDatabase } from '@sentinel/db';

export function readEcsMode(value = process.env.SENTINEL_ECS_MODE): 'off' | 'simulated' | 'live' {
 if (value !== 'off' && value !== 'simulated' && value !== 'live') throw new Error('SENTINEL_ECS_MODE must be off, simulated, or live');
 if (value === 'live' && !process.env.SENTINEL_READ_ROLE_ARN) throw new Error('live ECS mode requires SENTINEL_READ_ROLE_ARN');
 return value;
}

export function createActivities(db: SentinelDatabase) {
 const write = async (input: InvestigationInput, source: SourceName, outcome: SourceOutcome, provenance: Provenance | null, detail: unknown, extras: { severity?: string; observedAt?: string | null; windowCovered?: boolean | null } = {}) => {
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
 return {
  async recordSourceFailure(input: InvestigationInput, source: SourceName) {
   await write(input, source, 'unavailable', null, { reason: 'Evidence collection failed after retries.' });
  },
  async collectPrometheus(input: InvestigationInput): Promise<SourceResult> {
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
   let coverage: unknown = null;
   try {
    const end = Date.now() / 1000;
    const rows = await client.queryMatrix(process.env.SENTINEL_COVERAGE_QUERY || 'up{job="workload"}[6h]');
    // Multiple series require an explicit service mapping; never combine unrelated targets.
    if (rows.length === 1) {
     coverage = [300,1800,3600,21600].map(seconds=>({ windowSeconds: seconds, ...assessCoverage(rows[0].values,end-seconds,end) }));
     covered = (coverage as {covered:boolean}[]).every(window=>window.covered);
    }
   } catch { covered = false; }
   const sev = severity(sample);
   const outcome = covered ? 'ok' : 'uncovered';
   await write(input, 'prometheus', outcome, 'live', { ...sample, windowCovered: covered, coverage }, { severity: sev, observedAt: new Date().toISOString(), windowCovered: covered });
   return result('prometheus', outcome, 'live', `Prometheus SLI evaluated as ${sev}. No production action proposed.`);
  },
  async collectEcs(input: InvestigationInput): Promise<SourceResult> {
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
    if (service) {
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
   const detail = simulateCloudWatch('000000000000');
   await write(input, 'cloudwatch', 'ok', 'simulated', detail);
   return result('cloudwatch', 'ok', 'simulated', 'Simulated CloudWatch is not a measurement.');
  },
  async collectCost(input: InvestigationInput): Promise<SourceResult> {
   const detail = simulateCost('000000000000');
   await write(input, 'cost', 'ok', 'simulated', detail);
   return result('cost', 'ok', 'simulated', 'Simulated cost is not a bill.');
  },
  async collectDr(input: InvestigationInput): Promise<SourceResult> {
   const detail = simulateDr('000000000000');
   await write(input, 'dr', 'ok', 'simulated', detail);
   return result('dr', 'ok', 'simulated', 'Restore was not attempted.');
  },
  async recordInvestigation(input: InvestigationInput, outcome: InvestigationResult) {
   await db.inWorkspace(input.workspaceId, async client => {
    const prom = (await client.query("SELECT severity, outcome FROM incident_evidence WHERE workspace_id=$1 AND incident_id=$2 AND source='prometheus'", [input.workspaceId, input.incidentId])).rows[0];
    const severity = prom && (prom.outcome === 'ok' || prom.outcome === 'uncovered') ? prom.severity : null;
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
   if (!process.env.NTFY_URL || !process.env.NTFY_TOPIC) return;
   await publishNtfy(process.env.NTFY_URL, process.env.NTFY_TOPIC, `incident ${input.incidentId} ${outcome.status}`);
  },
 };
}
