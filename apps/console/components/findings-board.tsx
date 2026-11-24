'use client';
import { useEffect, useState } from 'react';
type Finding = { id: string; provider: string; outcome: string; provenance: string; collectedAt: string };
export function FindingsBoard() {
 const [rows, setRows] = useState<Finding[]>([]);
 const [message, setMessage] = useState('Loading findings…');
 useEffect(() => {
  const workspace = localStorage.getItem('sentinel-active-workspace');
  if (!workspace) { setMessage('Open a workspace from the overview first.'); return; }
  fetch(`/api/workspaces/${workspace}/findings`).then(async response => { if (!response.ok) throw new Error('Unable to load findings'); return response.json(); }).then(body => { setRows(body); setMessage(body.length ? '' : 'No findings stored.'); }).catch(error => setMessage(error.message));
 }, []);
 return <section>{message && <p role="status">{message}</p>}{rows.map(row => <article className="sc-card sc-detail-pad" key={row.id}><h2>{row.provider}</h2><p>{row.outcome} / {row.provenance}</p><p>{row.collectedAt}</p></article>)}</section>;
}
