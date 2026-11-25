import { notFound, redirect } from 'next/navigation';
import { CreateWorkspace } from '../../../components/workspace-dashboard-entry';
import { WorkspaceRoleDashboard } from '../../../components/workspace-role-dashboard';
import { dashboardMemberships } from '../../../lib/role-dashboard-access';
import { isWorkspaceRole, roleDashboardHref, workspaceRoleLabels } from '../../../lib/workspace-role';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  return { title: isWorkspaceRole(role) ? workspaceRoleLabels[role] + ' dashboard | Sentinel' : 'Sentinel' };
}

export default async function RoleDashboardPage({ params, searchParams }: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const { role } = await params;
  if (!isWorkspaceRole(role)) notFound();

  const memberships = await dashboardMemberships();
  if (!memberships) redirect('/demo/roles/' + role);
  const requested = (await searchParams).workspace;
  if (!memberships.length && requested === undefined) return <CreateWorkspace hasWorkspaces={false}/>;
  const workspace = requested === undefined
    ? memberships.find(item => item.role === role) ?? memberships[0]
    : memberships.find(item => item.workspace_id === requested);

  if (!workspace) notFound();
  if (workspace.role !== role) redirect(roleDashboardHref(workspace));

  return <WorkspaceRoleDashboard key={workspace.workspace_id} workspace={workspace} memberships={memberships}/>;
}
