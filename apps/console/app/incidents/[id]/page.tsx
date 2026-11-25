import { notFound, redirect } from 'next/navigation';
import { isUuid, workspaceAccess } from '../../../lib/workspace-access';
import { canRespond } from '../../../lib/workspace-role';
import { IncidentView } from './view';
export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ workspace?: string | string[] }> }) {
 const { id } = await params;
 const { workspace } = await searchParams;
 if (!workspace) return <p>Open this investigation from a workspace.</p>;
 if (typeof workspace !== 'string' || !isUuid(id)) notFound();
 const access = await workspaceAccess(workspace);
 if (access.error?.status === 401) redirect('/login');
 if (access.error) notFound();
 return <IncidentView workspaceId={workspace} incidentId={id} canRespond={canRespond(access.role)}/>;
}
