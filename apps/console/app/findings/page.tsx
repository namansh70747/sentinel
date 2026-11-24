import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { FindingsBoard } from '../../components/findings-board';
export const dynamic = 'force-dynamic';
export default async function FindingsPage() {
 if (!(await currentIdentity())) redirect('/login');
 return <section><div className="sc-eyebrow">FINDINGS</div><h1>What the local cluster actually returned.</h1><p>These rows are namespace reads. They are not an EKS verification.</p><FindingsBoard /></section>;
}
