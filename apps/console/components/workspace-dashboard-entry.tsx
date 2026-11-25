'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { activeWorkspaceId, isWorkspaceRole, rememberWorkspace, roleDashboardHref, workspaceRoleLabels, type WorkspaceMembership } from '../lib/workspace-role';

export function WorkspaceDashboardEntry({ memberships }: { memberships: WorkspaceMembership[] }) {
  const router = useRouter();
  useEffect(() => {
    const id = activeWorkspaceId(memberships);
    const workspace = memberships.find(item => item.workspace_id === id);
    if (workspace) router.replace(roleDashboardHref(workspace));
  }, [memberships, router]);

  return <section className="product-dashboard desk-enter">
    <h1>Open your workspace</h1>
    <p role="status">Loading your dashboard…</p>
    <ul>{memberships.map(workspace => <li key={workspace.workspace_id}>
      <a href={roleDashboardHref(workspace)}>{workspace.name} · {workspaceRoleLabels[workspace.role]}</a>
    </li>)}</ul>
  </section>;
}

export function CreateWorkspace({ hasWorkspaces }: { hasWorkspaces: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: new FormData(event.currentTarget).get('name') }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create workspace.');
      if (typeof data.workspace_id !== 'string' || !isWorkspaceRole(data.role)) throw new Error('Unable to open the new workspace.');
      rememberWorkspace(data.workspace_id);
      router.replace(roleDashboardHref(data as WorkspaceMembership));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create workspace.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="product-dashboard desk-enter">
    <h1>{hasWorkspaces ? 'Create a workspace' : 'Create your first workspace'}</h1>
    <p>Register services and connect evidence sources in your own workspace.</p>
    <form onSubmit={submit}>
      <label>Workspace name<input name="name" maxLength={200} required/></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Creating workspace…' : 'Create workspace'}</button>
    </form>
    {hasWorkspaces && <a href="/dashboard">Back to workspace</a>}
  </section>;
}
