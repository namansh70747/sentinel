import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { ChangeBoard } from '../../components/change-board';
export const dynamic = 'force-dynamic';
export default async function ChangesPage() {
 if (!(await currentIdentity())) redirect('/login');
 return <section><div className="sc-eyebrow">CHANGES</div><h1>What moved, and what that does not prove.</h1><p>Repository changes are timestamps next to an incident. A simulated deployment is not a cause.</p><ChangeBoard /></section>;
}
