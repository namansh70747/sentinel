'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  RoleDashboard, type DashboardActions, type DashboardAudit, type DashboardConnector,
  type DashboardIncident, type DashboardService, type ReadResult,
} from './role-dashboard';
import { rememberWorkspace, roleDashboardHref, workspaceRoleLabels, type WorkspaceMembership } from '../lib/workspace-role';

export function WorkspaceRoleDashboard({ workspace, memberships }: {
  workspace: WorkspaceMembership;
  memberships: WorkspaceMembership[];
}) {
  const router = useRouter();
  const [refresh, setRefresh] = useState(0);
  const id = workspace.workspace_id;
  const base = '/api/workspaces/' + encodeURIComponent(id);
  const scope = '?workspace=' + encodeURIComponent(id);
  const role = workspace.role;
  const services = useRoleResource<DashboardService[]>(base + '/services', 'services', refresh);
  const incidents = useRoleResource<DashboardIncident[]>(role !== 'admin' ? base + '/incidents' : null, 'incidents', refresh);
  const connectors = useRoleResource<DashboardConnector[]>(role === 'admin' ? base + '/connectors' : null, 'connectors', refresh);
  const audit = useRoleResource<DashboardAudit>(role === 'viewer' ? base + '/audit' : null, 'audit activity', refresh);

  useEffect(() => { rememberWorkspace(id); }, [id]);

  const actions: DashboardActions = {
    services: { href: '/services' + scope },
    connectors: { href: '/connectors' + scope },
    incidents: { href: '/incidents' + scope },
    newInvestigation: { href: '/incidents' + scope + '&new=1#ops-queue-heading' },
    audit: { href: '/audit' + scope },
    incident: incidentId => ({ href: '/incidents/' + encodeURIComponent(incidentId) + scope }),
  };

  return <RoleDashboard role={role} workspace={workspace.name} demo={false} data={{ services, incidents, connectors, audit }} actions={actions}
    workspaceControl={<label className="role-workspace-switch">
      Active workspace
      <select value={id} onChange={event => {
        const selection = memberships.find(item => item.workspace_id === event.currentTarget.value);
        if (!selection) return;
        rememberWorkspace(selection.workspace_id);
        router.push(roleDashboardHref(selection));
      }}>
        {memberships.map(item => <option key={item.workspace_id} value={item.workspace_id}>
          {item.name} · {workspaceRoleLabels[item.role]}
        </option>)}
      </select>
    </label>}
    footer={<div className="role-live-controls">
      <button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh dashboard</button>
      <a href="/settings">Account settings</a>
      <a href="/dashboard?create=1">Create workspace</a>
    </div>}/>;
}

function useRoleResource<T>(url: string | null, label: string, refresh: number): ReadResult<T> {
  const [result, setResult] = useState<ReadResult<T>>({ data: null });
  useEffect(() => {
    if (!url) return;
    const endpoint = url;
    const controller = new AbortController();
    let pending = false;

    async function load() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (controller.signal.aborted) return;
        if ([401, 403, 404].includes(response.status)) {
          setResult({ data: null, error: 'Workspace ' + label + ' are unavailable for this session.' });
          return;
        }
        if (!response.ok) throw new Error('Workspace dashboard read failed');
        const data = await response.json() as T;
        if (!controller.signal.aborted) setResult({ data });
      } catch {
        if (!controller.signal.aborted) setResult(current => ({ data: current.data, error: 'Could not refresh ' + label + '.' }));
      } finally {
        pending = false;
      }
    }

    void load();
    const timer = window.setInterval(load, 10000);
    document.addEventListener('visibilitychange', load);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [url, label, refresh]);
  return result;
}
