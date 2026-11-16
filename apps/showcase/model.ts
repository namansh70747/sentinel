import { MockEcsReadClient, type MockScenario } from '../../packages/connectors/src/ecs-mock';
export type Scenario = MockScenario;
export const scenarios: Record<Scenario,{label:string;description:string;title:string}> = {
  deployment:{label:'Deployment degradation',description:'A release, failing health checks, and a fast-burning error budget.',title:'Checkout availability dropped after deployment'},
  healthy:{label:'Healthy service',description:'All tasks healthy. Validate the clear-signal investigation path.',title:'Checkout service health check'},
  'aws-error':{label:'AWS read failure',description:'ECS context unavailable. Show explicit errors and partial evidence.',title:'Checkout alert with unavailable ECS context'},
  stale:{label:'Stale observations',description:'Old telemetry is rejected as a basis for a current conclusion.',title:'Checkout telemetry freshness warning'},
};
export type AuditEntry = {at:string;action:string;detail:string};
export type Run = {
  id:string;scenario:Scenario;title:string;createdAt:string;source:'mock';simulated:true;
  status:'complete'|'partial'|'needs-data';
  metrics:{availability:number;p99:number;errorRate:number;rps:number;observedAt:string;source:'mock';simulated:true};
  ecs: Awaited<ReturnType<MockEcsReadClient['observe']>> | null;
  error:string|null;summary:string;leads:string[];audit:AuditEntry[];
};
export async function investigate(scenario:Scenario, now = new Date(), id = `SNT-${now.getTime().toString(36).toUpperCase()}`):Promise<Run> {
  if (!Object.hasOwn(scenarios,scenario)) throw new Error('Unknown demo scenario');
  const at=now.toISOString();
  const old=new Date(now.getTime()-25*60_000).toISOString();
  const degraded=scenario==='deployment';
  const metrics={availability:degraded?97.82:99.98,p99:degraded?1240:148,errorRate:degraded?2.18:0.02,rps:428,observedAt:scenario==='stale'?old:at,source:'mock' as const,simulated:true as const};
  let ecs:Run['ecs']=null,error:string|null=null;
  try { ecs=await new MockEcsReadClient(scenario,()=>now).observe(); } catch(e) { error=e instanceof Error?e.message:String(e); }
  const status=error?'partial':scenario==='stale'?'needs-data':'complete';
  const summary=degraded?'Availability is below the 99.9% objective. Only 1 of 3 ECS tasks is running, and two tasks failed health checks. Deployment 42 is a possible contributing change; root cause is unconfirmed.':error?'Metrics were collected, but ECS context could not be read. The investigation is partial. Restore authorized read access before drawing a deployment conclusion.':scenario==='stale'?'The most recent observations are 25 minutes old, beyond the 5-minute freshness limit. Current service health is unknown. Restore telemetry and investigate again.':'All 3 ECS tasks are running. Availability and latency satisfy the configured objectives in this synthetic observation window. No remediation is recommended.';
  return {id,scenario,title:scenarios[scenario].title,createdAt:at,source:'mock',simulated:true,status,metrics,ecs,error,summary,
    leads:degraded?['Compare task definition 42 with the previous release.','Inspect container startup and health check logs.','Confirm impact with a fresh monitoring window.']:error?['Check the dedicated sandbox role and ECS read permissions.','Retry after the connection has been restored.']:scenario==='stale'?['Check the metrics scrape target and ingestion delay.','Collect fresh observations before concluding.']:['Continue observing the service.'],
    audit:[
      {at,action:'alert.received',detail:'Synthetic Grafana-format alert accepted in the browser demo.'},
      {at,action:'incident.created',detail:`${id} created for checkout-api; source=mock.`},
      {at,action:'investigation.started',detail:'Browser-local read-only investigation started. Temporal is not used in this prototype.'},
      {at,action:'metrics.collected',detail:`Synthetic metrics collected; observation time ${metrics.observedAt}.`},
      {at,action:error?'ecs.read_failed':'ecs.observed',detail:error??`Synthetic ECS observation: ${ecs?.runningCount}/${ecs?.desiredCount} tasks running.`},
      {at,action:scenario==='stale'?'evidence.stale':'evidence.recorded',detail:scenario==='stale'?'Freshness check failed: observations exceed 5 minutes.':'Evidence bundle assembled with source=mock and simulated=true.'},
      {at,action:'investigation.finished',detail:`Result: ${status}. No infrastructure actions executed.`},
    ]};
}
export function chartValues(scenario:Scenario,kind:'availability'|'latency'):number[] {
  return Array.from({length:40},(_,i)=>kind==='availability'?(scenario==='deployment'&&i>23?97.82+Math.sin(i*1.9)*.25:99.96+Math.sin(i)*.02):(scenario==='deployment'&&i>23?1100+Math.sin(i*1.4)*180:145+Math.sin(i)*16));
}
export function report(run:Run) {
 return `# Sentinel investigation — ${run.id}\n\nDEMO: all observations are synthetic. No live AWS, Prometheus or Grafana calls.\nBrowser-local orchestration; no Temporal or database persistence.\n\nService: checkout-api\nScenario: ${scenarios[run.scenario].label}\nCreated: ${run.createdAt}\nStatus: ${run.status}\n\n## Findings\n${run.summary}\n\n## Metrics (mock)\nAvailability: ${run.metrics.availability}% (objective 99.9%)\nP99: ${run.metrics.p99} ms (objective < 500 ms)\nObserved: ${run.metrics.observedAt}\n\n## ECS (mock)\n${run.error??`${run.ecs?.runningCount}/${run.ecs?.desiredCount} tasks running; ${run.ecs?.pendingCount} pending.`}\n\n## Next checks\n${run.leads.map(x=>`- ${x}`).join('\n')}\n\n## Audit\n${run.audit.map(x=>`- ${x.at} ${x.action}: ${x.detail}`).join('\n')}\n\n## Pending live verification\nAuthorized AWS sandbox, monitoring webhook, Temporal/database pipeline, OIDC/passkey verification. Remediation remains disabled.\n`;
}
