'use client';

import Link from 'next/link';
import { Activity, ArrowUpRight, CircleAlert, Clock3, Plus, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { SourceList, type SourceRow } from './source-list';

type Incident = {
  id: string;
  service_id: string;
  title: string;
  state: string;
  created_at: string;
  observed_severity: string | null;
  dispatched_at: string | null;
  sources: SourceRow[];
};

export function Investigations({ workspaceId, services, canStart }: {
  workspaceId: string;
  services: { id: string; name: string }[];
  canStart: boolean;
}) {
  const [rows, setRows] = useState<Incident[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [startError, setStartError] = useState('');

  useEffect(() => {
    let controller: AbortController | undefined;
    async function load() {
      if (controller) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch('/api/workspaces/' + workspaceId + '/incidents', {
          cache: 'no-store',
          signal: request.signal,
        });
        if (!response.ok) throw new Error('Could not refresh investigations.');
        const incidents: Incident[] = await response.json();
        if (request.signal.aborted) return;
        setRows(incidents);
        setUpdatedAt(new Date());
        setLoadError('');
      } catch {
        if (!request.signal.aborted) setLoadError('Could not refresh investigations.');
      } finally {
        controller = undefined;
      }
    }
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
      controller?.abort();
    };
  }, [workspaceId, refresh]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStartError('');
    setNotice('');
    try {
      const response = await fetch('/api/workspaces/' + workspaceId + '/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to queue investigation.');
      setNotice('Investigation queued. The read worker will collect evidence.');
      setCompose(false);
      setRefresh(value => value + 1);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Unable to queue investigation.');
    } finally {
      setBusy(false);
    }
  }

  const serviceNames = new Map(services.map(service => [service.id, service.name]));
  const states = [...new Set(rows?.map(row => row.state))].sort();
  const activeState = states.includes(status) ? status : 'all';
  const search = query.trim().toLowerCase();
  const visible = rows?.filter(row =>
    (activeState === 'all' || row.state === activeState) &&
    [row.title, serviceNames.get(row.service_id), row.observed_severity].some(value => value?.toLowerCase().includes(search)),
  );
  const active = rows?.filter(row => row.state === 'investigating').length;
  const escalated = rows?.filter(row => row.state === 'escalated').length;

  return <section className="ops-queue" aria-labelledby="ops-queue-heading">
    <header className="ops-queue-header">
      <div>
        <h2 id="ops-queue-heading">Investigation queue</h2>
        <p>Latest 100 investigations in this workspace</p>
      </div>
      {canStart && services.length > 0 && <button type="button" className="ops-action" aria-expanded={compose} aria-controls="ops-compose" disabled={busy} onClick={() => { setCompose(value => !value); setStartError(''); }}>
        <Plus size={16} /> New investigation
      </button>}
    </header>
    {compose && canStart && services.length > 0 && <form id="ops-compose" className="ops-compose" onSubmit={start}>
      <label>Service<select name="serviceId" required defaultValue=""><option value="" disabled>Select a service</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
      <label>Investigation title<input name="title" placeholder="Elevated latency on checkout" required maxLength={500} /></label>
      <button type="submit" disabled={busy}>{busy ? 'Queuing…' : 'Queue investigation'}</button>
      {startError && <p role="alert">{startError}</p>}
    </form>}
    {notice && <p className="ops-feedback" role="status">{notice}</p>}
    <div className="ops-metrics">
      <div><Activity size={17} /><strong>{rows?.length ?? '—'}</strong><span>Recent investigations</span></div>
      <div><Clock3 size={17} /><strong>{active ?? '—'}</strong><span>Investigating</span></div>
      <div><CircleAlert size={17} /><strong>{escalated ?? '—'}</strong><span>Escalated</span></div>
    </div>
    <div className="ops-toolbar">
      <label className="ops-search"><Search size={16} aria-hidden="true" /><input aria-label="Search investigations" placeholder="Search investigations" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="Filter by status" value={activeState} onChange={event => setStatus(event.target.value)}>
        <option value="all">All statuses</option>
        {states.map(state => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}
      </select>
      <button type="button" className="ops-refresh" onClick={() => setRefresh(value => value + 1)} aria-label="Refresh investigations" title="Refresh investigations"><RefreshCw size={16} /></button>
    </div>
    {loadError && <p className="ops-feedback" role="alert">{loadError}{rows && ' Showing the last successful response.'}</p>}
    {!rows && !loadError && <p className="ops-feedback" role="status">Loading investigations…</p>}
    {rows?.length === 0 && <p className="ops-feedback">No investigations yet. New Grafana alerts and manual investigations appear here.</p>}
    {!!rows?.length && !visible?.length && <p className="ops-feedback">No investigations match your filters.</p>}
    {visible?.map(row => <article className="ops-incident" key={row.id}>
      <div className="ops-incident-heading">
        <div>
          <Link href={'/incidents/' + row.id + '?workspace=' + workspaceId}>{row.title} <ArrowUpRight size={15} aria-hidden="true" /></Link>
          <p>{serviceNames.get(row.service_id) ?? 'Service'} · <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time></p>
        </div>
        <span className="ops-state" data-state={row.state}>{row.state.replaceAll('_', ' ')}</span>
      </div>
      <p>{row.dispatched_at ? 'Workflow dispatched' : 'Queued for worker'} · {row.observed_severity?.toUpperCase() ?? 'Severity pending evidence'}</p>
      {!!row.sources?.length && <details><summary>Evidence sources ({row.sources.length})</summary><SourceList sources={row.sources} /></details>}
    </article>)}
    {updatedAt && <footer className="ops-queue-footer">Last refreshed <time dateTime={updatedAt.toISOString()}>{updatedAt.toLocaleTimeString()}</time>{visible && ' · ' + visible.length + ' shown'}</footer>}
  </section>;
}
