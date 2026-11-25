'use client';

import {
  Activity, BookOpen, ChevronDown, CircleHelp, Database, Download, FileCheck2,
  FlaskConical, History, LayoutDashboard, Loader2, LockKeyhole, Maximize2,
  Minimize2, Play, Plug, RotateCcw, Search, Server, ShieldCheck, Users, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { investigate, report, scenarios, type Run, type Scenario } from '../../showcase/model';
import { BrandMark } from './brand-mark';
import { MockAwsConnector } from './mock-aws-connector';
import { ShowcaseRoleDashboard } from './showcase-role-dashboard';
import { type WorkspaceRole } from '../lib/workspace-role';
import {
  downloadReport, formatTime, InvestigationOverview, resultLabels, type EvidenceTab,
} from './showcase-investigation';
import { InvestigationMap, investigationStages } from './showcase-map';
import { useShowcasePlayback } from './showcase-replay';
import './showcase.css';
import './showcase-refresh.css';

const navigation = [
  { name: 'Overview', Icon: LayoutDashboard },
  { name: 'Role dashboards', Icon: Users },
  { name: 'Incidents', Icon: Activity },
  { name: 'Services', Icon: Server },
  { name: 'Connectors', Icon: Plug },
  { name: 'Audit log', Icon: FileCheck2 },
  { name: 'Demo readiness', Icon: BookOpen },
] as const;

type View = (typeof navigation)[number]['name'];
const historyKey = 'sentinel-showcase-v1';

const secondaryPages = {
  Incidents: { title: 'Incident history', description: 'Open an earlier investigation or run a new scenario.' },
  Services: { title: 'Services', description: 'Review objectives and infrastructure for the checkout service.' },
  Connectors: { title: 'Connectors', description: 'Inspect demo data sources and test the simulated ECS connection.' },
  'Audit log': { title: 'Audit log', description: 'Review the events recorded during demo investigations.' },
  'Demo readiness': { title: 'Demo readiness', description: 'See which workflows you can demonstrate in this browser.' },
};

function isRun(value: unknown): value is Run {
  if (!value || typeof value !== 'object') return false;
  const run = value as Run;
  return run.simulated === true && run.source === 'mock' &&
    typeof run.scenario === 'string' && Object.hasOwn(scenarios, run.scenario) &&
    typeof run.id === 'string' && typeof run.createdAt === 'string' && !isNaN(Date.parse(run.createdAt)) &&
    typeof run.title === 'string' && typeof run.summary === 'string' &&
    Array.isArray(run.leads) && run.leads.every(lead => typeof lead === 'string') &&
    Array.isArray(run.audit) && run.audit.every(entry => entry && typeof entry.at === 'string' && typeof entry.action === 'string' && typeof entry.detail === 'string') &&
    !!run.metrics && Number.isFinite(run.metrics.availability) && Number.isFinite(run.metrics.p99) &&
    typeof run.metrics.observedAt === 'string' && (run.ecs === null || run.ecs?.simulated === true) &&
    Object.hasOwn(resultLabels, run.status);
}

export function Showcase({ standalone = false, initialRole }: { standalone?: boolean; initialRole?: WorkspaceRole }) {
  const [view, setView] = useState<View>(initialRole ? 'Role dashboards' : 'Overview');
  const [previewRole, setPreviewRole] = useState<WorkspaceRole>(initialRole ?? 'admin');
  const [scenario, setScenario] = useState<Scenario>('deployment');
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState('');
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<EvidenceTab>('Evidence');
  const [step, setStep] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [presenting, setPresenting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [resetting, setResetting] = useState(false);
  const generation = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const running = step !== null;
  const run = runs.find(record => record.id === selected) ?? runs[0];
  const playback = useShowcasePlayback(run, view === 'Overview', running);

  useEffect(() => {
    const token = ++generation.current;
    const params = new URLSearchParams(window.location.search);
    const requested = navigation.find(item => item.name === params.get('view'));
    if (requested) setView(requested.name);
    setPresenting(params.get('present') === '1');
    setOffline(window.location.protocol === 'file:');

    async function load() {
      let history: Run[] = [];
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
        if (Array.isArray(saved)) history = saved.filter(isRun).slice(0, 12);
      } catch {
        // A saved investigation is optional. The demo can start with a fresh sample.
      }
      if (!history.length) history = [await investigate('deployment')];
      if (token !== generation.current) return;
      setRuns(history);
      setSelected(history[0].id);
      setScenario(history[0].scenario);
    }

    void load()
      .catch(() => { if (token === generation.current) setNotice('Could not load the sample. Run an investigation to begin.'); })
      .finally(() => { if (token === generation.current) setReady(true); });
    return () => { generation.current++; };
  }, []);

  useEffect(() => {
    if (!ready || !runs.length) return;
    try {
      localStorage.setItem(historyKey, JSON.stringify(runs));
    } catch {
      setNotice('Browser storage is unavailable. Export a report to keep your results.');
    }
  }, [runs, ready]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!presenting) return;
    function exitPresentation(event: KeyboardEvent) {
      if (event.key === 'Escape' && !dialog.current?.open) setPresenting(false);
    }
    window.addEventListener('keydown', exitPresentation);
    return () => window.removeEventListener('keydown', exitPresentation);
  }, [presenting]);

  function navigate(nextView: View) {
    if (view === nextView) return;
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function selectRun(record: Run, detail: EvidenceTab = 'Evidence') {
    setSelected(record.id);
    setScenario(record.scenario);
    setTab(detail);
    navigate('Overview');
  }

  async function start() {
    if (!ready || running || resetting) return;
    const token = ++generation.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    navigate('Overview');
    setNotice('');
    setStep(0);
    try {
      for (let index = 0; index < investigationStages.length; index++) {
        setStep(index);
        await new Promise(resolve => window.setTimeout(resolve, reducedMotion ? 120 : 510));
        if (token !== generation.current) return;
      }
      const result = await investigate(scenario);
      if (token !== generation.current) return;
      setRuns(history => [result, ...history].slice(0, 12));
      setSelected(result.id);
      setTab('Evidence');
      setNotice('Investigation recorded · ' + result.id);
    } catch {
      if (token === generation.current) setNotice('Could not complete the scenario. Try running it again.');
    } finally {
      if (token === generation.current) setStep(null);
    }
  }

  async function reset() {
    if (running || resetting) return;
    const token = ++generation.current;
    setResetting(true);
    try {
      const result = await investigate('deployment');
      if (token !== generation.current) return;
      setRuns([result]);
      setQuery('');
      selectRun(result);
      setNotice('Demo reset to the sample investigation.');
    } catch {
      if (token === generation.current) setNotice('Could not reset the demo. Try again.');
    } finally {
      if (token === generation.current) setResetting(false);
    }
  }

  const filter = query.trim().toLowerCase();
  const filtered = runs.filter(record => (record.id + ' ' + record.title + ' ' + resultLabels[record.status]).toLowerCase().includes(filter));
  const scenarioForm = <div className="sc-scenario-controls">
    <label className="sc-scenario-field">
      <span>Investigation scenario</span>
      <span className="sc-scenario-select">
        <select value={scenario} disabled={running || resetting} onChange={event => setScenario(event.currentTarget.value as Scenario)}>
          {Object.entries(scenarios).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden="true"/>
      </span>
    </label>
    <button type="button" className="sc-lab-primary" disabled={!ready || running || resetting} onClick={start}>
      {running ? <Loader2 size={17} className="sc-spin" aria-hidden="true"/> : <Play size={16} fill="currentColor" aria-hidden="true"/>}
      {running ? 'Investigating…' : 'Run investigation'}
    </button>
  </div>;

  return <div className="sc-app sc-showcase" data-presenting={presenting}>
    <a className="sc-lab-skip" href="#demo-content">Skip to content</a>
    {!presenting && <aside className="sc-lab-sidebar">
      <button type="button" className="sc-lab-brand" onClick={() => navigate('Overview')}><BrandMark/><span>Sentinel</span></button>
      <nav aria-label="Demo navigation">
        {navigation.map(({ name, Icon }) => <button key={name} type="button" onClick={() => navigate(name)} aria-current={view === name ? 'page' : undefined}>
          <Icon size={17} aria-hidden="true"/><span>{name}</span>
        </button>)}
      </nav>
      <div className="sc-lab-sidebar-end">
        <span className="sc-lab-readonly"><ShieldCheck size={17} aria-hidden="true"/> Read-only workspace</span>
        {!offline && <a href={standalone ? 'http://localhost:3010/dashboard' : '/dashboard'}>Open workspace</a>}
      </div>
    </aside>}
    <div className="sc-lab-main">
      <header className="sc-lab-topbar">
        <div className="sc-lab-breadcrumb">
          {presenting && <BrandMark/>}
          <span>Demo workspace</span><span aria-hidden="true">/</span>
          {presenting && view !== 'Overview' && <button type="button" className="sc-control" onClick={() => navigate('Overview')}>Overview</button>}
          <strong>{view}</strong>
        </div>
        <div className="sc-lab-actions">
          <span className="sc-lab-simulation"><FlaskConical size={14} aria-hidden="true"/> Simulated data</span>
          {presenting && view !== 'Role dashboards' && <button type="button" className="sc-control" onClick={() => navigate('Role dashboards')}><Users size={16} aria-hidden="true"/> Roles</button>}
          <button type="button" className="sc-control sc-presentation-toggle" onClick={() => setPresenting(current => !current)}>
            {presenting ? <Minimize2 size={16} aria-hidden="true"/> : <Maximize2 size={16} aria-hidden="true"/>}
            {presenting ? 'Exit presentation' : 'Present'}
          </button>
          <button type="button" className="sc-control sc-help-button" aria-label="How the demo works" onClick={() => dialog.current?.showModal()}>
            <CircleHelp size={18} aria-hidden="true"/>
          </button>
        </div>
      </header>
      <main id="demo-content" className="sc-lab-content" tabIndex={-1}>
        {view === 'Overview' ? <>
          <section className="sc-lab-hero" data-running={running} data-motion={playback.motion}>
            <div className="sc-lab-hero-main">
              <div className="sc-hero-copy">
                <span className="sc-hero-service"><Server size={15} aria-hidden="true"/> checkout-api</span>
                <h1>Incident <span>overview</span></h1>
                <p>Follow a checkout alert from its first signal to the evidence behind it.</p>
                {scenarioForm}
              </div>
              <InvestigationMap run={run} step={step} playback={playback}/>
            </div>
          </section>
          {!ready && <p className="sc-lab-loading" role="status"><Loader2 className="sc-spin" size={19} aria-hidden="true"/> Loading the sample investigation…</p>}
          {run && <>
            {running && <p className="sc-lab-previous">Showing the previous result while the new scenario runs.</p>}
            <InvestigationOverview key={run.id} run={run} tab={tab} playback={playback} onTabChange={setTab} onAudit={() => navigate('Audit log')}/>
            {!presenting && <>
              <div className="sc-lab-section-heading">
                <h2>Recent investigations</h2>
                <button type="button" className="sc-control" onClick={() => navigate('Incidents')}>View history</button>
              </div>
              <IncidentTable runs={runs.slice(0, 4)} selected={run.id} onSelect={selectRun}/>
            </>}
          </>}
        </> : view === 'Role dashboards' ? <ShowcaseRoleDashboard role={previewRole} selectRole={setPreviewRole}
          standalone={standalone} presenting={presenting} ready={ready} runs={runs} actions={{
            connectors: { activate: () => navigate('Connectors') },
            services: { activate: () => navigate('Services') },
            incidents: { activate: () => navigate('Incidents') },
            newInvestigation: { activate: () => { if (ready) void start(); else navigate('Overview'); } },
            audit: { activate: () => navigate('Audit log') },
            incident: id => ({ activate: () => {
              const record = runs.find(item => item.id === id);
              if (record) selectRun(record);
            } }),
          }}/>
          : <>
          <header className="sc-lab-page-heading">
            <div><h1>{secondaryPages[view].title}</h1><p>{secondaryPages[view].description}</p></div>
            {view === 'Incidents' && scenarioForm}
          </header>
          {view === 'Incidents' && <section className="sc-card sc-history">
            <div className="sc-history-toolbar">
              <label className="sc-history-search"><Search size={17} aria-hidden="true"/>
                <input type="search" aria-label="Search investigations" placeholder="Search investigations" value={query} onChange={event => setQuery(event.currentTarget.value)}/>
              </label>
              <span>{filtered.length} {filtered.length === 1 ? 'investigation' : 'investigations'}</span>
            </div>
            <IncidentTable runs={filtered} selected={run?.id} onSelect={selectRun}/>
          </section>}
          {view === 'Services' && <ServicesPage/>}
          {view === 'Connectors' && <ConnectorsPage/>}
          {view === 'Audit log' && <AuditLog runs={runs} onSelect={record => selectRun(record, 'Timeline')}/>}
          {view === 'Demo readiness' && <DemoReadiness onOverview={() => navigate('Overview')}/>}
        </>}
        <footer className="sc-lab-footer">
          <span><LockKeyhole size={14} aria-hidden="true"/> Demo records are stored in this browser.</span>
          <div>
            <button type="button" className="sc-control" disabled={!run} onClick={() => run && downloadReport(run.id + '-report.md', report(run), 'text/markdown')}>
              <Download size={15} aria-hidden="true"/> Export report
            </button>
            {!presenting && view !== 'Role dashboards' && <button type="button" className="sc-control" disabled={!ready || running || resetting} onClick={reset}>
              <RotateCcw size={15} aria-hidden="true"/> Reset demo
            </button>}
          </div>
        </footer>
      </main>
    </div>
    <dialog className="sc-demo-guide" ref={dialog} aria-labelledby="sc-demo-guide-title">
      <header><FlaskConical size={23} aria-hidden="true"/><button type="button" className="sc-control" onClick={() => dialog.current?.close()} aria-label="Close guide"><X size={19} aria-hidden="true"/></button></header>
      <h2 id="sc-demo-guide-title">How the demo works</h2>
      <p>Choose a scenario and run an investigation. Sentinel simulates the alert, metrics, and ECS read, then records the evidence in this browser.</p>
      <p>Use the replay to compare availability and latency. Open the evidence and timeline to explain what happened, then export the report.</p>
      <button type="button" className="sc-lab-primary" onClick={() => dialog.current?.close()}>Back to demo</button>
    </dialog>
    <div className="sc-lab-notice" role="status">{notice}</div>
  </div>;
}

function IncidentTable({ runs, selected, onSelect }: {
  runs: Run[]; selected?: string; onSelect: (run: Run) => void;
}) {
  if (!runs.length) return <div className="sc-table-empty"><Search size={21} aria-hidden="true"/><p>No matching investigations.</p></div>;
  return <div className="sc-lab-table" role="region" aria-label="Investigation records" tabIndex={0}>
    <table>
      <thead><tr><th scope="col">Investigation</th><th scope="col">Scenario</th><th scope="col">Status</th><th scope="col">Created (IST)</th></tr></thead>
      <tbody>{runs.map(record => <tr key={record.id} data-selected={selected === record.id}>
        <td><button type="button" onClick={() => onSelect(record)}>{record.title}<small>{record.id}</small></button></td>
        <td>{scenarios[record.scenario].label}</td>
        <td><span className="sc-result-badge" data-tone={record.status === 'complete' ? 'good' : 'warning'}>{resultLabels[record.status]}</span></td>
        <td>{formatTime(record.createdAt)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ServicesPage() {
  return <div className="sc-lab-columns">
    <section className="sc-card sc-context-panel">
      <h2><Activity size={17} aria-hidden="true"/> Service objectives</h2>
      <dl>
        <div><dt>Service</dt><dd>checkout-api</dd></div>
        <div><dt>Availability</dt><dd>99.9%</dd></div>
        <div><dt>P99 latency</dt><dd>&lt; 500 ms</dd></div>
        <div><dt>Freshness limit</dt><dd>5 minutes</dd></div>
      </dl>
    </section>
    <section className="sc-card sc-context-panel">
      <h2><Server size={17} aria-hidden="true"/> ECS resource binding</h2>
      <dl>
        <div><dt>Account</dt><dd>000000000000 (fictional)</dd></div>
        <div><dt>Region</dt><dd>ap-south-1</dd></div>
        <div><dt>Cluster</dt><dd>sentinel-demo</dd></div>
        <div><dt>Owner</dt><dd>Commerce platform</dd></div>
      </dl>
    </section>
  </div>;
}

function ConnectorsPage() {
  const sources = [
    { title: 'Prometheus', detail: 'Availability, latency, and freshness observations.', Icon: Activity },
    { title: 'Grafana', detail: 'Sample alert intake that starts investigations.', Icon: Activity },
    { title: 'Amazon ECS', detail: 'Task counts, service health, and deployment observations.', Icon: Server },
    { title: 'Temporal', detail: 'The live workspace uses Temporal. The demo runs its stages in the browser.', Icon: History },
    { title: 'OIDC and passkeys', detail: 'Organization identity and passkeys are used in a configured workspace.', Icon: LockKeyhole },
    { title: 'PostgreSQL', detail: 'The live workspace persists records in PostgreSQL. Demo records use browser storage.', Icon: Database },
  ];
  return <div className="sc-lab-connectors">
    <MockAwsConnector/>
    <div className="sc-lab-columns" aria-label="Data sources">{sources.map(({ title, detail, Icon }) =>
      <section className="sc-card sc-context-panel" key={title}><h2><Icon size={17} aria-hidden="true"/> {title}</h2><p>{detail}</p></section>)}</div>
  </div>;
}

function AuditLog({ runs, onSelect }: { runs: Run[]; onSelect: (run: Run) => void }) {
  return <div className="sc-lab-table" role="region" aria-label="Audit events" tabIndex={0}>
    <table>
      <thead><tr><th scope="col">Time (IST)</th><th scope="col">Investigation</th><th scope="col">Event</th><th scope="col">Details</th></tr></thead>
      <tbody>{runs.flatMap(run => run.audit.map((entry, index) => <tr key={run.id + '-' + index}>
        <td>{formatTime(entry.at)}</td>
        <td><button type="button" onClick={() => onSelect(run)}>{run.id}</button></td>
        <td><code>{entry.action}</code></td>
        <td>{entry.detail}</td>
      </tr>))}</tbody>
    </table>
  </div>;
}

function DemoReadiness({ onOverview }: { onOverview: () => void }) {
  return <section className="sc-card sc-context-panel sc-readiness-panel">
    <h2><FlaskConical size={18} aria-hidden="true"/> Walkthrough</h2>
    <ol>
      <li>Run deployment degradation and review the availability and latency charts.</li>
      <li>Jump to the deployment, then open the evidence and incident timeline.</li>
      <li>Run AWS read failure or stale observations to show how Sentinel reports gaps.</li>
      <li>Export an investigation report with the findings and audit history.</li>
    </ol>
    <button type="button" className="sc-lab-primary" onClick={onOverview}>Start walkthrough</button>
  </section>;
}
