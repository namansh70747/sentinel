export const workspaceRoles = ['admin', 'responder', 'viewer'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceRoleLabels: Record<WorkspaceRole, string> = {
  admin: 'Admin',
  responder: 'Responder',
  viewer: 'Viewer',
};

export type WorkspaceMembership = {
  workspace_id: string;
  name: string;
  role: WorkspaceRole;
};

export function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return workspaceRoles.some(item => item === role);
}

export function canRespond(role: string) {
  return role === 'admin' || role === 'responder';
}

export function roleDashboardHref(workspace: WorkspaceMembership) {
  return '/dashboard/' + workspace.role + '?workspace=' + encodeURIComponent(workspace.workspace_id);
}

export function activeWorkspaceId(rows: { workspace_id: string }[], requested?: string) {
  let saved = '';
  try { saved = localStorage.getItem('sentinel-active-workspace') ?? ''; } catch {}
  return rows.find(row => row.workspace_id === requested)?.workspace_id ??
    rows.find(row => row.workspace_id === saved)?.workspace_id ?? rows[0]?.workspace_id ?? '';
}

export function rememberWorkspace(id: string) {
  if (!id) return;
  try { localStorage.setItem('sentinel-active-workspace', id); } catch {}
}
