import { redirect } from 'next/navigation';
import { WorkspaceSetup } from '../../components/workspace-setup';
import { currentIdentity } from '../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ workspace?: string; new?: string }> }) {
  if (!(await currentIdentity())) redirect('/login');
  const { workspace, new: newInvestigation } = await searchParams;

  return <div className="ops-incidents-page">
    <h1>Incidents</h1>
    <p>Start a read-only investigation or review evidence from an existing incident.</p>
    <WorkspaceSetup section="incidents" initialWorkspaceId={workspace} openNewInvestigation={newInvestigation === '1'}/>
  </div>;
}
