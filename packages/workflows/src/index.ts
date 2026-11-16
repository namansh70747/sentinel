import { isCancellation, patched, proxyActivities } from '@temporalio/workflow';
import type { SourceResult, SourceName } from '@sentinel/contracts';
export interface InvestigationInput { workspaceId: string; incidentId: string; serviceId: string }
export interface InvestigationResult { status: 'advised' | 'escalated'; summary: string }
export interface ReadActivities {
 collectPrometheus(input: InvestigationInput): Promise<SourceResult>;
 collectEcs(input: InvestigationInput): Promise<SourceResult>;
 collectLoki(input: InvestigationInput): Promise<SourceResult>;
 collectTempo(input: InvestigationInput): Promise<SourceResult>;
 collectGithub(input: InvestigationInput): Promise<SourceResult>;
 collectCloudwatch(input: InvestigationInput): Promise<SourceResult>;
 collectCost(input: InvestigationInput): Promise<SourceResult>;
 collectDr(input: InvestigationInput): Promise<SourceResult>;
 recordSourceFailure(input: InvestigationInput, source: SourceName): Promise<void>;
 recordInvestigation(input: InvestigationInput, result: InvestigationResult): Promise<void>;
 notifyNtfy(input: InvestigationInput, result: InvestigationResult): Promise<void>;
}
const activities = proxyActivities<ReadActivities>({ startToCloseTimeout: '30 seconds', retry: { maximumAttempts: 3, initialInterval: '2 seconds' } });
const optionalCollectors = [
 ['ecs', activities.collectEcs], ['loki', activities.collectLoki], ['tempo', activities.collectTempo],
 ['github', activities.collectGithub], ['cloudwatch', activities.collectCloudwatch],
 ['cost', activities.collectCost], ['dr', activities.collectDr],
] as const;

async function collectOptional(input: InvestigationInput, source: SourceName, collect: (input: InvestigationInput) => Promise<SourceResult>) {
 try { await collect(input); }
 catch (error) { if (isCancellation(error)) throw error; await activities.recordSourceFailure(input, source); }
}

async function collectOptionalBounded(input: InvestigationInput) {
 for (let index = 0; index < optionalCollectors.length; index += 4) {
  await Promise.all(optionalCollectors.slice(index, index + 4).map(([source, collect]) => collectOptional(input, source, collect)));
 }
}
function failureText(error: unknown) {
 const seen = new Set<unknown>();
 let current = error;
 let last = 'Evidence collection failed';
 while (current && typeof current === 'object' && !seen.has(current)) {
  seen.add(current);
  const message = 'message' in current && typeof current.message === 'string' ? current.message : '';
  if (message && !message.startsWith('Activity task failed')) last = message;
  current = 'cause' in current ? current.cause : undefined;
 }
 return last;
}
/** Read-only investigation. A missing Prometheus sample escalates. Optional sources do not. */
export async function investigateIncident(input: InvestigationInput): Promise<InvestigationResult> {
 let prometheus: SourceResult;
 try { prometheus = await activities.collectPrometheus(input); }
 catch (error) { prometheus = { source: 'prometheus', outcome: 'unavailable', provenance: null, summary: failureText(error) }; }
 if (patched('bounded-optional-collectors-v1')) await collectOptionalBounded(input);
 else {
  await activities.collectEcs(input);
  await activities.collectLoki(input);
  await activities.collectTempo(input);
  await activities.collectGithub(input);
  await activities.collectCloudwatch(input);
  await activities.collectCost(input);
  await activities.collectDr(input);
 }
 const result: InvestigationResult = prometheus.outcome === 'ok' || prometheus.outcome === 'uncovered'
  ? { status: 'advised', summary: prometheus.summary }
  : { status: 'escalated', summary: prometheus.summary };
 await activities.recordInvestigation(input, result);
 if (patched('notification-failure-isolation-v1')) {
  try { await activities.notifyNtfy(input, result); }
  catch (error) { if (isCancellation(error)) throw error; /* Delivery failure must not roll back a persisted investigation. */ }
 } else await activities.notifyNtfy(input, result);
 return result;
}
