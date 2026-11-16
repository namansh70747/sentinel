import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { WorkspaceSetup } from '../../components/workspace-setup';
export const dynamic='force-dynamic';
export default async function ServicesPage() {
 if(!(await currentIdentity())) redirect('/login');
 return <section><div className="sc-eyebrow">SERVICE CATALOG</div><h1>Your services. In context.</h1><p>Register ownership, define reliability objectives and configure alert intake.</p><WorkspaceSetup section="services"/></section>;
}
