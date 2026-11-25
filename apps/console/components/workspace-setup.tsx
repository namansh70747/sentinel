'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { activeWorkspaceId, canRespond, rememberWorkspace, type WorkspaceMembership } from '../lib/workspace-role';
import { GrafanaWebhook } from './grafana-webhook';
import { Investigations } from './investigations';
import { SloSetup } from './slo-setup';
import { WorkspaceAudit } from './workspace-audit';

type Section = 'incidents' | 'audit' | 'services';
type Service = { id: string; name: string; owner: string; region: string; act: boolean };
const serviceFields = [
  ['name', 'Service name'], ['owner', 'Owner'], ['account_id', 'AWS account ID'],
  ['region', 'AWS region'], ['resource_arn', 'ECS service ARN'],
];

export function WorkspaceSetup({ section, initialWorkspaceId, openNewInvestigation }: {
  section: Section;
  initialWorkspaceId?: string;
  openNewInvestigation?: boolean;
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[] | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const workspace = workspaces?.find(item => item.workspace_id === selected);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/workspaces', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Unable to load workspaces.');
      const rows: WorkspaceMembership[] = await response.json();
      if (controller.signal.aborted) return;
      setWorkspaces(rows);
      const id = activeWorkspaceId(rows, initialWorkspaceId);
      setSelected(id);
      rememberWorkspace(id);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [initialWorkspaceId]);

  return <section className="workspace-setup">
    {error ? <p role="alert">{error}</p> : !workspaces ? <p role="status">Loading workspaces…</p> :
      !workspace ? <a href="/dashboard">Create your first workspace</a> : <>
        <label>Active workspace
          <select value={selected} onChange={event => {
            setSelected(event.currentTarget.value);
            rememberWorkspace(event.currentTarget.value);
          }}>
            {workspaces.map(item => <option key={item.workspace_id} value={item.workspace_id}>{item.name}</option>)}
          </select>
        </label>
        {section === 'audit' ? <WorkspaceAudit key={selected} workspaceId={selected}/> :
          <ServiceWorkspace key={selected} workspace={workspace} section={section}
            openNewInvestigation={openNewInvestigation && (!initialWorkspaceId || initialWorkspaceId === selected)}/>}
      </>}
  </section>;
}

function ServiceWorkspace({ workspace, section, openNewInvestigation }: {
  workspace: WorkspaceMembership;
  section: 'incidents' | 'services';
  openNewInvestigation?: boolean;
}) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const id = workspace.workspace_id;
  const endpoint = '/api/workspaces/' + encodeURIComponent(id) + '/services';
  const admin = workspace.role === 'admin';

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Unable to load services.');
      const rows: Service[] = await response.json();
      if (!controller.signal.aborted) setServices(rows);
    }).catch(cause => { if (!controller.signal.aborted) setMessage(cause.message); });
    return () => controller.abort();
  }, [endpoint, reload]);

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to register service.');
      form.reset();
      setReload(value => value + 1);
      setMessage('Service registered in advise mode. Connect telemetry to collect evidence.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to register service.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    {message && <p role="status">{message}</p>}
    {section === 'incidents' ?
      <Investigations workspaceId={id} services={services ?? []} canStart={canRespond(workspace.role)} initiallyCompose={openNewInvestigation}/> :
      <>
        <h2>Registered services</h2>
        {!services ? !message && <p role="status">Loading services…</p> : services.length === 0 ? <p>No services registered.</p> :
          services.map(service => <article className="sc-card sc-detail-pad" key={service.id}>
            <h3>{service.name}</h3>
            <p>{service.owner} / {service.region} / {service.act ? 'Act enabled' : 'Advise mode'}</p>
            {admin && <>
              <SloSetup workspaceId={id} serviceId={service.id}/>
              <GrafanaWebhook workspaceId={id} serviceId={service.id}/>
            </>}
          </article>)}
        {admin && <form onSubmit={createService}>
          <h2>Register an ECS service</h2>
          {serviceFields.map(([name, label]) => <label key={name}>{label}<input name={name} required maxLength={2048}/></label>)}
          <button type="submit" disabled={busy}>Register service</button>
        </form>}
      </>}
  </>;
}
