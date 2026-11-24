'use client';
import { useEffect, useState } from 'react';
type Workspace = { workspace_id: string; name: string };
type Service = { id: string; name: string };
type Change = { kind: string; title: string; revision: string | null; occurred_at: string; url: string | null };
export function ChangeBoard() {
 const [workspace, setWorkspace] = useState('');
 const [services, setServices] = useState<Service[]>([]);
 const [rows, setRows] = useState<Change[]>([]);
 const [message, setMessage] = useState('Loading workspaces…');
 useEffect(() => { fetch('/api/workspaces').then(async response => { if (!response.ok) throw new Error('Unable to load workspaces'); return response.json(); }).then((list: Workspace[]) => { const saved = localStorage.getItem('sentinel-active-workspace') ?? ''; setWorkspace(list.find(item => item.workspace_id === saved)?.workspace_id ?? list[0]?.workspace_id ?? ''); setMessage(list.length ? '' : 'Create a workspace first.'); }).catch(error => setMessage(error.message)); }, []);
 useEffect(() => { if (!workspace) return; fetch(`/api/workspaces/${workspace}/services`).then(response => response.json()).then(setServices).catch(() => setMessage('Unable to load services')); }, [workspace]);
 useEffect(() => { if (!workspace || !services[0]) { setRows([]); return; } fetch(`/api/workspaces/${workspace}/services/${services[0].id}/changes`).then(async response => { if (!response.ok) throw new Error('Changes are not available for this service'); return response.json(); }).then(setRows).catch(error => setMessage(error.message)); }, [workspace, services]);
 return <section>{message && <p role="status">{message}</p>}{services[0] && <p>Showing {services[0].name}. Adjacent in time is not a proven cause.</p>}{rows.length ? <ul>{rows.map(row => <li key={`${row.kind}-${row.revision}-${row.occurred_at}`}>{row.kind}: {row.title} {row.revision ? `(${row.revision})` : ''}</li>)}</ul> : <p>No stored changes for this service.</p>}</section>;
}
