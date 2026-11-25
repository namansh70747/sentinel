'use client';

import { Activity, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Run } from '../../showcase/model';
import { RoleDashboard, type DashboardActions, type DashboardConnector, type DashboardIncident } from './role-dashboard';
import { workspaceRoles, workspaceRoleLabels, type WorkspaceRole } from '../lib/workspace-role';

const demoService = { id: 'checkout-api', name: 'checkout-api', owner: 'Commerce platform', region: 'ap-south-1' };
const roleIcons = { admin: ShieldCheck, responder: Activity, viewer: ClipboardCheck };

export function ShowcaseRoleDashboard({
  role, selectRole, standalone, presenting, runs, ready, actions,
}: {
  role: WorkspaceRole;
  selectRole: (role: WorkspaceRole) => void;
  standalone: boolean;
  presenting: boolean;
  runs: Run[];
  ready: boolean;
  actions: DashboardActions;
}) {
  const [evidenceId, setEvidenceId] = useState('');
  const evidenceDialog = useRef<HTMLDialogElement>(null);
  const evidence = runs.find(run => run.id === evidenceId);
  const roleActions: DashboardActions = role === 'viewer' ? {
    ...actions,
    incident: id => ({ activate: () => {
      setEvidenceId(id);
      evidenceDialog.current?.showModal();
    } }),
  } : actions;
  const latest = runs[0];
  const incidents: DashboardIncident[] = runs.map(run => ({
    id: run.id,
    title: run.title,
    service_id: demoService.id,
    state: run.status === 'complete' ? 'advised' : 'escalated',
    created_at: run.createdAt,
    observed_severity: run.scenario === 'deployment' ? 'sev2' : null,
  }));
  const connectors: DashboardConnector[] = [
    {
      id: 'prometheus', name: 'Checkout metrics', provider: 'prometheus', mode: 'live', configVersion: 1,
      lastTest: latest && latest.scenario !== 'stale' ? verifiedRead : null,
    },
    {
      id: 'ecs', name: 'Checkout AWS ECS', provider: 'ecs', mode: 'live', configVersion: 1,
      lastTest: latest?.ecs && latest.scenario !== 'stale' ? verifiedRead : null,
    },
    { id: 'loki', name: 'Application logs', provider: 'loki', mode: 'live', configVersion: 1, lastTest: null },
    { id: 'slack', name: 'Incident notifications', provider: 'slack', mode: 'off', configVersion: 1, lastTest: null },
  ];
  const events = runs.flatMap(run => [...run.audit].reverse().map((entry, index) => ({
    id: run.id + '-' + index,
    action: entry.action,
    actor: 'Simulated investigation',
    created_at: entry.at,
  })));

  return <>
    <nav className="role-preview-nav" aria-label="Preview a workspace role">
      {workspaceRoles.map(item => {
        const Icon = roleIcons[item];
        const label = <><Icon size={16} aria-hidden="true"/> {workspaceRoleLabels[item]}</>;
        const current = role === item ? 'page' : undefined;
        return standalone ?
          <button key={item} type="button" data-role={item} aria-current={current} onClick={() => selectRole(item)}>{label}</button> :
          <a key={item} href={'/demo/roles/' + item + (presenting ? '?present=1' : '')} data-role={item} aria-current={current}>{label}</a>;
      })}
    </nav>
    <RoleDashboard key={role} role={role} workspace="Demo workspace" demo actions={roleActions} data={{
      services: { data: [demoService] },
      incidents: { data: ready ? incidents : null },
      connectors: { data: ready ? connectors : null },
      audit: { data: ready ? { events, integrity: { verified: false, reason: 'Simulated audit record' } } : null },
    }}/>
    <dialog className="sc-demo-guide role-evidence-dialog" ref={evidenceDialog} aria-labelledby="role-evidence-title">
      <h2 id="role-evidence-title">{evidence?.title ?? 'Incident evidence'}</h2>
      {evidence && <>
        <p>{evidence.summary}</p>
        <dl>
          <div><dt>Availability</dt><dd>{evidence.metrics.availability.toFixed(2)}%</dd></div>
          <div><dt>P99 latency</dt><dd>{evidence.metrics.p99.toLocaleString('en-IN')} ms</dd></div>
          <div><dt>Evidence source</dt><dd>Simulated telemetry</dd></div>
        </dl>
      </>}
      <button type="button" className="sc-control" onClick={() => evidenceDialog.current?.close()}>Close evidence</button>
    </dialog>
  </>;
}

const verifiedRead = { configVersion: 1, status: 'succeeded', result: { outcome: 'verified-read' } };
