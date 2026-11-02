import { proxyActivities } from '@temporalio/workflow';
export interface InvestigationInput { workspaceId: string; incidentId: string; serviceId: string }
export interface InvestigationResult { status: 'advised' | 'escalated'; summary: string }
export interface ReadActivities {
 collectEvidence(input: InvestigationInput): Promise<{ available: boolean; summary: string }>;
 recordInvestigation(input: InvestigationInput, result: InvestigationResult): Promise<void>;
}
const activities = proxyActivities<ReadActivities>({ startToCloseTimeout: '30 seconds', retry: { maximumAttempts: 3 } });
/** Read-only investigation. Missing evidence always escalates; this worker has no actuation path. */
export async function investigateIncident(input: InvestigationInput): Promise<InvestigationResult> {
 let result: InvestigationResult;
 try {
  const evidence = await activities.collectEvidence(input);
  result = evidence.available ? { status: 'advised', summary: evidence.summary } : { status: 'escalated', summary: 'Evidence unavailable; human investigation required.' };
 } catch {
  result = { status: 'escalated', summary: 'Evidence collection failed; human investigation required.' };
 }
 await activities.recordInvestigation(input, result);
 return result;
}
