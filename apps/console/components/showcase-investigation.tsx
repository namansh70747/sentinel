'use client';

import {
  Activity, Check, ChevronRight, Circle, Clock3, FileCheck2, GitBranch,
  Loader2, LockKeyhole, Network, Server, ShieldCheck, Terminal, TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { Run } from '../../showcase/model';
import { ShowcaseReplay } from './showcase-replay';

export const investigationStages = ['Receive alert', 'Create incident', 'Collect metrics', 'Read ECS context', 'Record evidence'];
const evidenceTabs = ['Evidence', 'Timeline', 'Raw data'] as const;
export type EvidenceTab = (typeof evidenceTabs)[number];

export function downloadReport(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const formatTime = (date: string) => new Date(date).toLocaleTimeString('en-IN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata',
});

export const resultLabels = { complete: 'Complete', partial: 'Partial', 'needs-data': 'Needs data' };
type Tone = 'good' | 'warning' | 'notice' | 'neutral';

export function InvestigationProgress({ step, run }: { step: number | null; run?: Run }) {
  return <div className="sc-workflow">
    <div className="sc-workflow-label">
      <span>Investigation workflow</span>
      <div className="sc-workflow-result">
        <span role="status">
          {step !== null ? investigationStages[step] + ' · ' + (step + 1) + '/' + investigationStages.length : run ? resultLabels[run.status] : 'Ready'}
        </span>
        {step === null && run && <a href="#investigation-evidence">View evidence</a>}
      </div>
    </div>
    <ol>
      {investigationStages.map((label, index) => {
        const complete = step !== null ? index < step : Boolean(run);
        const active = step === index;
        const warning = complete && (
          (index === 2 && run?.status === 'needs-data' && step === null) ||
          (index === 3 && run?.status === 'partial' && step === null)
        );
        const state = active ? 'active' : warning ? 'warning' : complete ? 'complete' : 'queued';
        return <li key={label} data-state={state} aria-current={active ? 'step' : undefined}>
          <span className="sc-workflow-icon" aria-hidden="true">
            {active ? <Loader2 size={15} className="sc-spin"/> : warning ? <TriangleAlert size={14}/> : complete ? <Check size={15}/> : <Circle size={11}/>}
          </span>
          <span>{label}<span className="sc-sr-only">, {state}</span></span>
        </li>;
      })}
    </ol>
  </div>;
}

export function InvestigationOverview({ run, tab, onTabChange, onAudit }: {
  run: Run;
  tab: EvidenceTab;
  onTabChange: (tab: EvidenceTab) => void;
  onAudit: () => void;
}) {
  const degraded = run.scenario === 'deployment';
  const stale = run.scenario === 'stale';
  const serviceTone: Tone = stale ? 'notice' : degraded ? 'warning' : 'good';
  const ecsTone: Tone = run.error || degraded ? 'warning' : stale ? 'notice' : 'good';
  const formatLatency = run.metrics.p99.toLocaleString('en-IN') + ' ms';
  return <div className="sc-run-result" key={run.id}>
    <section className="sc-snapshot" aria-labelledby="demo-snapshot-title">
      <h2 id="demo-snapshot-title">Investigation snapshot</h2>
      <div className="sc-lab-metrics">
        <Metric label="Availability" value={run.metrics.availability.toFixed(2) + '%'}
          note={stale ? 'Stale observation' : degraded ? 'Below 99.9% objective' : 'Meets 99.9% objective'}
          tone={serviceTone} Icon={Activity}/>
        <Metric label="P99 latency" value={formatLatency}
          note={stale ? 'Stale observation' : degraded ? 'Above 500 ms objective' : 'Within 500 ms objective'}
          tone={serviceTone} Icon={Clock3}/>
        <Metric label="ECS tasks" value={run.ecs ? run.ecs.runningCount + ' / ' + run.ecs.desiredCount : 'Unavailable'}
          note={run.error ? 'Read failed' : stale ? 'Stale observation' : run.ecs ? run.ecs.pendingCount + ' pending' : 'No task data'}
          tone={ecsTone} Icon={Server}/>
        <Metric label="Investigation" value={resultLabels[run.status]} note={run.audit.length + ' audit events'}
          tone={run.status === 'complete' ? 'good' : 'warning'} Icon={ShieldCheck}/>
      </div>
    </section>
    <ShowcaseReplay scenario={run.scenario}/>
    <div className="sc-lab-workbench" id="investigation-evidence">
      <EvidencePanel run={run} tab={tab} onTabChange={onTabChange} onAudit={onAudit}/>
      <aside className="sc-lab-context" aria-label="Supporting context">
        <section className="sc-card sc-context-panel">
          <h2><Network size={17} aria-hidden="true"/> Service context</h2>
          <div className="sc-context-service"><span><Server size={19} aria-hidden="true"/></span><div><strong>checkout-api</strong><p>Commerce platform</p></div></div>
          <dl>
            <div><dt>Environment</dt><dd>Sandbox</dd></div>
            <div><dt>Region</dt><dd>ap-south-1</dd></div>
            <div><dt>Runtime</dt><dd>ECS / Fargate</dd></div>
            <div><dt>Cluster</dt><dd>sentinel-demo</dd></div>
          </dl>
        </section>
        <section className="sc-card sc-context-panel">
          <h2><ChevronRight size={17} aria-hidden="true"/> Next checks</h2>
          <ul>{run.leads.map(lead => <li key={lead}>{lead}</li>)}</ul>
          <span className="sc-read-only"><LockKeyhole size={14} aria-hidden="true"/> Read-only recommendations</span>
        </section>
      </aside>
    </div>
  </div>;
}

function Metric({ label, value, note, tone, Icon }: {
  label: string; value: string; note: string; tone: Tone; Icon: LucideIcon;
}) {
  return <section className="sc-card sc-lab-metric" data-tone={tone}>
    <div><h3>{label}</h3><Icon size={17} aria-hidden="true"/></div>
    <strong>{value}</strong><p>{note}</p>
  </section>;
}

function EvidencePanel({ run, tab, onTabChange, onAudit }: {
  run: Run;
  tab: EvidenceTab;
  onTabChange: (tab: EvidenceTab) => void;
  onAudit: () => void;
}) {
  const tabId = useId();
  const degraded = run.scenario === 'deployment';
  const stale = run.scenario === 'stale';
  const selectedIndex = evidenceTabs.indexOf(tab);

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (selectedIndex + 1) % evidenceTabs.length; break;
      case 'ArrowLeft': nextIndex = (selectedIndex + evidenceTabs.length - 1) % evidenceTabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = evidenceTabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    onTabChange(evidenceTabs[nextIndex]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  return <section className="sc-card sc-evidence-panel" aria-label="Investigation results">
    <header>
      <div><span className="sc-lab-meta">{run.id} · {formatTime(run.createdAt)} IST</span><h2>{run.title}</h2></div>
      <span className="sc-result-badge" data-tone={degraded || run.status !== 'complete' ? 'warning' : 'good'}>
        {degraded ? 'SEV 2' : resultLabels[run.status]}
      </span>
    </header>
    <div className="sc-lab-tabs" role="tablist" aria-label="Investigation details" onKeyDown={moveTab}>
      {evidenceTabs.map((name, index) => <button key={name} type="button" role="tab" id={tabId + '-' + index}
        aria-selected={name === tab} aria-controls={tabId + '-panel'} tabIndex={name === tab ? 0 : -1}
        onClick={() => onTabChange(name)}>{name}</button>)}
    </div>
    <div className="sc-evidence-body" role="tabpanel" id={tabId + '-panel'} aria-labelledby={tabId + '-' + selectedIndex} tabIndex={0}>
      {tab === 'Evidence' && <div className="sc-evidence-content" key="evidence">
        <div className="sc-investigation-brief"><h3><FileCheck2 size={17} aria-hidden="true"/> Investigation brief</h3><p>{run.summary}</p></div>
        <EvidenceItem Icon={Activity} label="Service-level indicators" source="Simulated Prometheus"
          status={stale ? 'Stale' : degraded ? 'Breach' : 'Within SLO'} tone={stale ? 'notice' : degraded ? 'warning' : 'good'}>
          {run.metrics.availability}% availability · {run.metrics.p99} ms P99 · observed {formatTime(run.metrics.observedAt)} IST
        </EvidenceItem>
        <EvidenceItem Icon={Server} label="ECS service context" source="Simulated AWS ECS"
          status={run.error ? 'Read failed' : stale ? 'Stale' : degraded ? 'Degraded' : 'Healthy'}
          tone={run.error || degraded ? 'warning' : stale ? 'notice' : 'good'}>
          {run.error ?? (run.ecs && (run.ecs.runningCount + ' running / ' + run.ecs.desiredCount + ' desired · ' + run.ecs.pendingCount + ' pending'))}
        </EvidenceItem>
        <EvidenceItem Icon={GitBranch} label="Deployment context" source="Simulated AWS ECS"
          status={run.error ? 'Unavailable' : stale ? 'Stale' : degraded ? 'Possible lead' : 'Stable'}
          tone={run.error || stale ? 'notice' : degraded ? 'warning' : 'good'}>
          {run.error ? 'The ECS read failed, so deployment evidence is unavailable.' :
            stale ? 'The deployment observation is stale and the current rollout status is unknown.' :
              degraded ? 'Task definition :42 preceded the health-check failures. The root cause requires further investigation.' :
                'Task definition :42 completed its rollout and reached steady state.'}
        </EvidenceItem>
      </div>}
      {tab === 'Timeline' && <ol className="sc-event-timeline" key="timeline">
        {run.audit.map((entry, index) => <li key={entry.action + index}>
          <span aria-hidden="true"><Check size={13}/></span>
          <div><strong>{entry.action.replaceAll('.', ' / ').replaceAll('_', ' ')}</strong><p>{entry.detail}</p><small>{formatTime(entry.at)} IST</small></div>
        </li>)}
      </ol>}
      {tab === 'Raw data' && <div className="sc-evidence-raw" key="raw">
        <header><span><Terminal size={16} aria-hidden="true"/> Evidence bundle</span>
          <button type="button" className="sc-control" onClick={() => downloadReport(run.id + '.json', JSON.stringify(run, null, 2), 'application/json')}>Download JSON</button>
        </header>
        <pre tabIndex={0}>{JSON.stringify(run, null, 2)}</pre>
      </div>}
    </div>
    <footer><span><LockKeyhole size={14} aria-hidden="true"/> Read-only investigation</span><button type="button" onClick={onAudit}>View audit log</button></footer>
  </section>;
}

function EvidenceItem({ Icon, label, source, status, tone, children }: {
  Icon: LucideIcon; label: string; source: string; status: string; tone: Tone; children: ReactNode;
}) {
  return <article className="sc-evidence-item">
    <span className="sc-evidence-mark"><Icon size={17} aria-hidden="true"/></span>
    <div><h3>{label}</h3><p>{children}</p><small>{source}</small></div>
    <span className="sc-result-badge" data-tone={tone}>{status}</span>
  </article>;
}
