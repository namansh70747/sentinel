import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { WorkspaceSetup } from '../../components/workspace-setup';
export const dynamic='force-dynamic';
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
 if(!(await currentIdentity())) redirect('/login');
 const { workspace } = await searchParams;
 return <section><div className="sc-eyebrow">ACCOUNTABILITY</div><h1>A record you can inspect.</h1><p>Review attributed workspace activity and the available audit integrity checks.</p><WorkspaceSetup section="audit" initialWorkspaceId={workspace}/></section>;
}
