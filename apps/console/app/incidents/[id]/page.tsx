import { IncidentView } from './view';
export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ workspace?: string }> }) {
 const { id } = await params;
 const { workspace } = await searchParams;
 if (!workspace) return <p>Open this investigation from a workspace.</p>;
 return <IncidentView workspaceId={workspace} incidentId={id} />;
}
