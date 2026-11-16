'use client';
import { useEffect, useState } from 'react';
import { SourceList, type SourceRow } from '../../../components/source-list';
type Incident = { id: string; title: string; state: string; severity: string; observed_severity: string | null; sources: SourceRow[] };
export function IncidentView({ workspaceId, incidentId }: { workspaceId: string; incidentId: string }) {
 const [row, setRow] = useState<Incident | null>(null);
 const [error, setError] = useState('');
 useEffect(() => {
  let cancelled = false;
  const load = async () => {
   const response = await fetch(`/api/workspaces/${workspaceId}/incidents`, { cache: 'no-store' });
   if (!response.ok) { if (!cancelled) setError('Unable to load investigations'); return; }
   const body = await response.json() as Incident[];
   const found = body.find(item => item.id === incidentId) ?? null;
   if (!cancelled) { setRow(found); setError(found ? '' : 'Investigation not found'); }
  };
  void load();
  const id = setInterval(load, 5000);
  return () => { cancelled = true; clearInterval(id); };
 }, [workspaceId, incidentId]);
 if (error) return <p role="status">{error}</p>;
 if (!row) return <p>Loading investigation.</p>;
 return <article>
  <h1>{row.title}</h1>
  <p>{row.observed_severity ?? 'not measured'} / {row.state}</p>
  <SourceList sources={row.sources ?? []} />
 </article>;
}
