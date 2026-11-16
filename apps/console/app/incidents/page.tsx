import { WorkspaceSetup } from '../../components/workspace-setup';
import { currentIdentity } from '../../lib/auth';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function IncidentsPage() {
 if(!(await currentIdentity())) redirect('/login');
 return <section><div className="sc-eyebrow">INCIDENT OPERATIONS</div><h1>Every signal. A clear record.</h1><p>Investigate service impact and inspect the evidence collected for your workspace.</p><WorkspaceSetup section="incidents"/></section>;
}
