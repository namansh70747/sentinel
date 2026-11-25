import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { WorkspaceSetup } from '../../components/workspace-setup';
export const dynamic='force-dynamic';
export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
 if(!(await currentIdentity())) redirect('/login');
 const { workspace } = await searchParams;
 return <section><div className="sc-eyebrow">SERVICE CATALOG</div><h1>Your services. In context.</h1><p>Review service ownership, reliability objectives, and alert intake.</p><WorkspaceSetup section="services" initialWorkspaceId={workspace}/></section>;
}
