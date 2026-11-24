'use client';
import { useEffect, useState } from 'react';
import { SourceList, type SourceRow } from '../../../components/source-list';
import { InvestigationRuns } from '../../../components/investigation-runs';
type Incident = { id: string; title: string; state: string; state_version: number; severity: string; observed_severity: string | null; sources: SourceRow[] };
type Note = { id: string; body: string };
export function IncidentView({ workspaceId, incidentId }: { workspaceId: string; incidentId: string }) {
 const [row, setRow] = useState<Incident | null>(null);
 const [notes, setNotes] = useState<Note[]>([]);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 useEffect(() => {
  let cancelled = false;
  const controller = new AbortController();
  const load = async () => {
   try {
    const response = await fetch(`/api/workspaces/${workspaceId}/incidents/${incidentId}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) { if (!cancelled) setError(response.status === 404 ? 'Investigation not found' : 'Unable to load investigation'); return; }
    const body = await response.json() as Incident;
    const noteResponse = await fetch(`/api/workspaces/${workspaceId}/incidents/${incidentId}/notes`, { cache: 'no-store', signal: controller.signal });
    const noteBody = noteResponse.ok ? await noteResponse.json() as Note[] : [];
    if (!cancelled) { setRow(body); setNotes(noteBody); setError(''); }
   } catch { if (!cancelled) setError('Unable to load investigation'); }
  };
  void load();
  const id = setInterval(load, 5000);
  return () => { cancelled = true; controller.abort(); clearInterval(id); };
 }, [workspaceId, incidentId]);
 if (error) return <p role="status">{error}</p>;
 if (!row) return <p>Loading investigation.</p>;
 return <article>
  <h1>{row.title}</h1>
  <p>{row.observed_severity ?? 'not measured'} / {row.state}</p>
  <InvestigationRuns workspaceId={workspaceId} incidentId={incidentId}/>
  <details><summary>Legacy incident evidence</summary><p>Historical observations are preserved separately from fresh investigation runs.</p><SourceList sources={row.sources ?? []} /></details>
  <section>
   <h2>Notes</h2>
   {notes.length ? notes.map(note => <p key={note.id}>{note.body}</p>) : <p>No operator notes yet.</p>}
   <form onSubmit={async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get('body') ?? '');
    const response = await fetch(`/api/workspaces/${workspaceId}/incidents/${incidentId}/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) });
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error ?? 'Unable to record note'); return; }
    setNotes(current => [...current, { id: payload.id, body }]);
    form.reset();
    setNotice('Note recorded.');
   }}><label>Operator note<textarea name="body" required maxLength={4000} /></label><button>Record note</button></form>
  </section>
  <section>
   <h2>Recovery</h2>
   <p>A resolved alert does not close this incident. Recovery requires a live covered Prometheus result.</p>
   <form onSubmit={async event => {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
    const response = await fetch(`/api/workspaces/${workspaceId}/incidents/${incidentId}/transitions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toState: 'recovered', reason, expectedVersion: Number(row.state_version) }) });
    const payload = await response.json();
    setNotice(response.ok ? `State is ${payload.state}.` : payload.error ?? 'Transition refused');
   }}><label>Reason<textarea name="reason" required maxLength={500} /></label><button>Mark recovered</button></form>
   <form onSubmit={async event => {
    event.preventDefault();
    const response = await fetch(`/api/workspaces/${workspaceId}/incidents/${incidentId}/postmortem`, { method: 'POST' });
    const payload = await response.json();
    setNotice(response.ok ? payload.markdown : payload.error ?? 'Draft failed');
   }}><button type="submit">Draft postmortem</button></form>
   {notice && <p role="status">{notice}</p>}
  </section>
 </article>;
}
