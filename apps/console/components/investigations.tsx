'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SourceList, type SourceRow } from './source-list';
type Incident = { id: string; title: string; state: string; severity: string; observed_severity: string | null; dispatched_at: string | null; sources: SourceRow[] };
export function Investigations({ workspaceId, services, canStart }: { workspaceId: string; services: { id: string; name: string }[]; canStart: boolean }) {
 const [rows, setRows] = useState<Incident[]>([]);
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 useEffect(() => {
  let cancelled = false;
  const load = async () => {
   try {
    const response = await fetch(`/api/workspaces/${workspaceId}/incidents`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load investigations');
    const body = await response.json();
    if (!cancelled) { setRows(body); setError(''); }
   } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Load failed'); }
  };
  void load();
  const id = setInterval(load, 5000);
  return () => { cancelled = true; clearInterval(id); };
 }, [workspaceId]);
 async function start(serviceId: string) {
  setBusy(true);
  try {
   const response = await fetch(`/api/workspaces/${workspaceId}/incidents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceId, title: `Manual investigation: ${services.find(service => service.id === serviceId)?.name}` }) });
   const body = await response.json();
   if (!response.ok) throw new Error(body.error);
   setError('Investigation queued. A running read worker will collect evidence.');
  } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to start investigation'); }
  finally { setBusy(false); }
 }
 return <section>
  <h2>Investigations</h2>
  <p role="status">{error}</p>
  {!rows.length && <p>No investigation yet. Run one from a service, or wait for Grafana.</p>}
  {canStart && services.map(service => <button key={service.id} disabled={busy} onClick={() => start(service.id)}>Run investigation for {service.name}</button>)}
  {rows.map(row => <article key={row.id}>
   <h3><Link href={`/incidents/${row.id}?workspace=${workspaceId}`}>{row.title}</Link></h3>
   <p>{row.state} / {row.dispatched_at ? 'Workflow dispatched' : 'Queued for worker'} / {row.observed_severity ?? 'Severity pending evidence'}</p>
   <SourceList sources={row.sources ?? []} />
  </article>)}
 </section>;
}
