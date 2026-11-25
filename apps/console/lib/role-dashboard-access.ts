import 'server-only';
import { redirect } from 'next/navigation';
import { currentIdentity, getAuth } from './auth';
import { isWorkspaceRole, type WorkspaceMembership } from './workspace-role';

export async function dashboardMemberships(): Promise<WorkspaceMembership[] | null> {
  const auth = getAuth();
  if (!auth) return null;
  const identity = await currentIdentity();
  if (!identity) redirect('/login');
  const rows = await auth.memberships(identity.id);
  return rows.flatMap(row => isWorkspaceRole(row.role) ? [{
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    role: row.role,
  }] : []);
}
