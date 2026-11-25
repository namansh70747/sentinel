'use client';

import {
  Activity, ArrowUpRight, BellRing, ChevronRight, ClipboardCheck, Database,
  FileCheck2, Network, Plug, Server, ShieldCheck,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { workspaceRoleLabels, type WorkspaceRole } from '../lib/workspace-role';
import './role-dashboard.css';

export type ReadResult<T> = { data: T | null; error?: string };
export type DashboardService = { id: string; name: string; owner: string; region: string };
export type DashboardIncident = {
  id: string; title: string; service_id: string; state: string; created_at: string; observed_severity: string | null;
};
export type DashboardConnector = {
  id: string; name: string; provider: string; mode: 'live' | 'off'; configVersion: number;
  lastTest: { configVersion: number; status: string; result: { outcome: string } | null } | null;
};
export type DashboardAudit = {
  events: { id: string; action: string; actor: string; created_at: string }[];
  integrity: { verified: boolean; reason: string };
};
export type DashboardData = {
  services: ReadResult<DashboardService[]>;
  incidents: ReadResult<DashboardIncident[]>;
  connectors: ReadResult<DashboardConnector[]>;
  audit: ReadResult<DashboardAudit>;
};

export type DashboardDestination = { href: string } | { activate: () => void };
export type DashboardActions = {
  services: DashboardDestination;
  connectors: DashboardDestination;
  incidents: DashboardDestination;
  newInvestigation: DashboardDestination;
  audit: DashboardDestination;
  incident: (id: string) => DashboardDestination;
};

const roleContent = {
  admin: { title: 'Workspace administration', description: 'Manage services, configure data sources, and verify connector access.', Icon: ShieldCheck },
  responder: { title: 'Incident response', description: 'Triage open incidents, start investigations, and review the evidence.', Icon: Activity },
  viewer: { title: 'Reliability overview', description: 'Read incident findings and follow workspace activity.', Icon: ClipboardCheck },
};

export function RoleDashboard({ role, workspace, demo, data, actions, workspaceControl, footer }: {
  role: WorkspaceRole;
  workspace: string;
  demo: boolean;
  data: DashboardData;
  actions: DashboardActions;
  workspaceControl?: ReactNode;
  footer?: ReactNode;
}) {
  const { title, description, Icon } = roleContent[role];
  return <div className="role-dashboard" data-role={role} key={role}>
    <div className="role-dashboard-bar">
      <span><Icon size={16} aria-hidden="true"/> {workspaceRoleLabels[role]} · {workspace}</span>
      {workspaceControl}
    </div>
    <header className="role-hero">
      <div className="role-hero-copy">
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="role-actions">
          {role === 'admin' && <>
            <DashboardAction destination={actions.connectors} primary><Plug size={16} aria-hidden="true"/> Manage connectors</DashboardAction>
            <DashboardAction destination={actions.services}>Service catalog</DashboardAction>
          </>}
          {role === 'responder' && <>
            <DashboardAction destination={actions.newInvestigation} primary><Activity size={16} aria-hidden="true"/> {demo ? 'Run demo investigation' : 'New investigation'}</DashboardAction>
            <DashboardAction destination={actions.incidents}>Incident history</DashboardAction>
          </>}
          {role === 'viewer' && <>
            <DashboardAction destination={actions.audit} primary><FileCheck2 size={16} aria-hidden="true"/> Open audit log</DashboardAction>
            <DashboardAction destination={actions.incidents}>Browse incidents</DashboardAction>
          </>}
        </div>
      </div>
      {role === 'admin' && <ConnectorCoverage sources={data.connectors}/>}
      {role === 'responder' && <IncidentSummary incidents={data.incidents}/>}
      {role === 'viewer' && <AuditStatus audit={data.audit}/>}
    </header>
    <div className="role-workspace-content">
      {role === 'admin' && <>
        <ConnectorInventory sources={data.connectors}/>
        <ServiceInventory services={data.services} destination={actions.services} configure/>
      </>}
      {role === 'responder' && <IncidentBoard incidents={data.incidents} services={data.services} destination={actions.incident} triage/>}
      {role === 'viewer' && <>
        <IncidentBoard incidents={data.incidents} services={data.services} destination={actions.incident}/>
        <AuditTimeline audit={data.audit}/>
        <ServiceInventory services={data.services} destination={actions.services}/>
      </>}
    </div>
    {footer}
  </div>;
}

function DashboardAction({ destination, children, primary = false }: {
  destination: DashboardDestination; children: ReactNode; primary?: boolean;
}) {
  const className = primary ? 'role-action role-action-primary' : 'role-action';
  return 'href' in destination ? <a href={destination.href} className={className}>{children}</a> :
    <button type="button" className={className} onClick={destination.activate}>{children}</button>;
}

type ConnectorStatus = 'verified' | 'review' | 'disabled';
const connectorStates = [
  { key: 'verified', label: 'Verified read' },
  { key: 'review', label: 'Needs verification' },
  { key: 'disabled', label: 'Disabled' },
] as const;

function connectorStatus(source: DashboardConnector): ConnectorStatus {
  if (source.mode === 'off') return 'disabled';
  if (source.lastTest?.configVersion === source.configVersion && source.lastTest.result?.outcome === 'verified-read') return 'verified';
  return 'review';
}

function ConnectorCoverage({ sources }: { sources: ReadResult<DashboardConnector[]> }) {
  const total = sources.data?.length ?? 0;
  const counts = { verified: 0, review: 0, disabled: 0 };
  sources.data?.forEach(source => { counts[connectorStatus(source)]++; });
  return <section className="role-pulse role-connector-coverage" aria-labelledby="role-connector-coverage-title">
    <div className="role-pulse-heading"><Network size={20} aria-hidden="true"/><h2 id="role-connector-coverage-title">Connector verification</h2></div>
    {sources.data ? <>
      <strong className="role-pulse-number">{total}</strong><span className="role-pulse-caption"> configured {total === 1 ? 'connector' : 'connectors'}</span>
      <div className="role-meter" aria-hidden="true">
        {connectorStates.map(({ key }) => <span key={key} data-tone={key} style={{ flexGrow: counts[key] }}/>) }
      </div>
      <div className="role-meter-legend">
        {connectorStates.map(({ key, label }) => <span key={key} data-tone={key}><i aria-hidden="true"/>{counts[key]} {label.toLowerCase()}</span>)}
      </div>
    </> : <ReadNotice result={sources} loading="Checking connector verification…"/>}
  </section>;
}

function ConnectorInventory({ sources }: { sources: ReadResult<DashboardConnector[]> }) {
  const [filter, setFilter] = useState<ConnectorStatus | 'all'>('all');
  const rows = sources.data?.filter(source => filter === 'all' || connectorStatus(source) === filter);
  return <section className="role-panel" aria-label="Connector inventory">
    <div className="role-panel-heading"><h2><Plug size={18} aria-hidden="true"/> Connector inventory</h2></div>
    <div className="role-filters" role="group" aria-label="Filter connectors">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
      {connectorStates.map(({ key, label }) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
    </div>
    <ReadNotice result={sources} loading="Loading connectors…"/>
    {rows?.length ? <ul className="role-connector-grid">
      {rows.map(source => {
        const status = connectorStatus(source);
        return <li key={source.id} data-tone={status}>
          <span className="role-item-icon"><Plug size={18} aria-hidden="true"/></span>
          <div><strong>{source.name}</strong><p>{source.provider.toUpperCase()}</p></div>
          <span className="role-state" data-tone={status}>{connectorStates.find(item => item.key === status)?.label}</span>
        </li>;
      })}
    </ul> : rows && <p className="role-empty">{filter === 'all' ? 'No connectors configured.' : 'No connectors match this filter.'}</p>}
  </section>;
}

const isResolved = (incident: DashboardIncident) => ['recovered', 'closed'].includes(incident.state);
const incidentTone = (incident: DashboardIncident) => isResolved(incident) ? 'verified' : incident.state === 'escalated' ? 'review' : 'active';

function IncidentSummary({ incidents }: { incidents: ReadResult<DashboardIncident[]> }) {
  return <section className="role-pulse role-response-pulse" aria-labelledby="role-incident-summary-title">
    <div className="role-pulse-heading"><BellRing size={20} aria-hidden="true"/><h2 id="role-incident-summary-title">Incident triage</h2></div>
    {incidents.data ? <div className="role-response-stats">
      <div><strong>{incidents.data.filter(row => !isResolved(row)).length}</strong><span>Open</span></div>
      <div><strong>{incidents.data.filter(row => row.state === 'escalated').length}</strong><span>Escalated</span></div>
      <div><strong>{incidents.data.filter(isResolved).length}</strong><span>Recovered or closed</span></div>
    </div> : <ReadNotice result={incidents} loading="Loading incident counts…"/>}
  </section>;
}

function IncidentBoard({ incidents, services, destination, triage = false }: {
  incidents: ReadResult<DashboardIncident[]>;
  services: ReadResult<DashboardService[]>;
  destination: DashboardActions['incident'];
  triage?: boolean;
}) {
  const [filter, setFilter] = useState<'open' | 'all' | 'resolved'>(triage ? 'open' : 'all');
  const visible = incidents.data?.filter(row => filter === 'all' || (filter === 'resolved' ? isResolved(row) : !isResolved(row)));
  return <section className="role-panel role-incident-panel" aria-label={triage ? 'Triage queue' : 'Reported incidents'}>
    <div className="role-panel-heading">
      <h2><Activity size={18} aria-hidden="true"/> {triage ? 'Triage queue' : 'Reported incidents'}</h2>
      <div className="role-filters" role="group" aria-label="Filter incidents">
        {(['open', 'all', 'resolved'] as const).map(item => <button type="button" key={item}
          aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'resolved' ? 'Recovered or closed' : item === 'all' ? 'All' : 'Open'}</button>)}
      </div>
    </div>
    <ReadNotice result={incidents} loading="Loading incidents…"/>
    {visible?.length ? <ul className="role-incident-list">
      {visible.slice(0, 8).map(incident => <li key={incident.id} data-tone={incidentTone(incident)}>
        <span className="role-item-icon"><Activity size={17} aria-hidden="true"/></span>
        <div><strong>{incident.title}</strong><p>{services.data?.find(service => service.id === incident.service_id)?.name ?? 'Service'} · <Time value={incident.created_at}/></p></div>
        <div className="role-item-status">
          {incident.observed_severity && <span className="role-severity">{incident.observed_severity.toUpperCase()}</span>}
          <span className="role-state" data-tone={incidentTone(incident)}>{incident.state.replaceAll('_', ' ')}</span>
        </div>
        <DashboardAction destination={destination(incident.id)}>Open {triage ? 'incident' : 'evidence'}<ArrowUpRight size={14} aria-hidden="true"/></DashboardAction>
      </li>)}
    </ul> : visible && <p className="role-empty">No incidents match this filter.</p>}
  </section>;
}

function AuditStatus({ audit }: { audit: ReadResult<DashboardAudit> }) {
  return <section className="role-pulse role-audit-pulse" aria-labelledby="role-audit-status-title">
    <div className="role-pulse-heading"><FileCheck2 size={20} aria-hidden="true"/><h2 id="role-audit-status-title">Audit records</h2></div>
    {audit.data ? <>
      <strong className="role-pulse-number">{audit.data.events.length}</strong><span className="role-pulse-caption"> recent events</span>
      <p className="role-integrity" data-tone={audit.data.integrity.verified ? 'verified' : 'review'}>
        <ShieldCheck size={17} aria-hidden="true"/> {audit.data.integrity.verified ? 'Audit segment verified' : audit.data.integrity.reason}
      </p>
    </> : <ReadNotice result={audit} loading="Loading audit records…"/>}
  </section>;
}

function AuditTimeline({ audit }: { audit: ReadResult<DashboardAudit> }) {
  return <section className="role-panel role-activity-panel" aria-label="Workspace activity">
    <div className="role-panel-heading"><h2><FileCheck2 size={18} aria-hidden="true"/> Workspace activity</h2></div>
    <ReadNotice result={audit} loading="Loading workspace activity…"/>
    {audit.data?.events.length ? <ol className="role-activity-list">
      {audit.data.events.slice(0, 6).map(item => <li key={item.id}>
        <span aria-hidden="true"/><div><strong>{item.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong><p>{item.actor} · <Time value={item.created_at}/></p></div>
      </li>)}
    </ol> : audit.data && <p className="role-empty">No recorded activity yet.</p>}
  </section>;
}

function ServiceInventory({ services, destination, configure = false }: {
  services: ReadResult<DashboardService[]>; destination: DashboardDestination; configure?: boolean;
}) {
  return <section className="role-panel" aria-label="Service inventory">
    <div className="role-panel-heading">
      <h2><Database size={18} aria-hidden="true"/> Service inventory</h2>
      <DashboardAction destination={destination}>{configure ? 'Manage services' : 'View services'}<ChevronRight size={15} aria-hidden="true"/></DashboardAction>
    </div>
    <ReadNotice result={services} loading="Loading services…"/>
    {services.data?.length ? <ul className="role-service-grid">
      {services.data.slice(0, 6).map(service => <li key={service.id}>
        <span className="role-item-icon"><Server size={17} aria-hidden="true"/></span>
        <div><strong>{service.name}</strong><p>{service.owner} · {service.region}</p></div>
      </li>)}
    </ul> : services.data && <p className="role-empty">No registered services.</p>}
  </section>;
}

function ReadNotice({ result, loading }: { result: ReadResult<unknown>; loading: string }) {
  if (result.error) return <p className="role-empty" role="status">{result.error}{result.data !== null ? ' Showing the last successful read.' : ''}</p>;
  return result.data === null ? <p className="role-empty" role="status">{loading}</p> : null;
}

function Time({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value}>{Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }) + ' IST'}</time>;
}
