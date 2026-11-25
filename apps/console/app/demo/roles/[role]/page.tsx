import { notFound } from 'next/navigation';
import { Showcase } from '../../../../components/showcase';
import { isWorkspaceRole, workspaceRoleLabels, workspaceRoles } from '../../../../lib/workspace-role';

export function generateStaticParams() {
  return workspaceRoles.map(role => ({ role }));
}

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  return { title: isWorkspaceRole(role) ? workspaceRoleLabels[role] + ' demo | Sentinel' : 'Sentinel' };
}

export default async function RoleDemoPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isWorkspaceRole(role)) notFound();
  return <Showcase initialRole={role}/>;
}
