import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { PasskeySettings } from '../../components/passkey-settings';
export const dynamic = 'force-dynamic';
export default async function SettingsPage() {
 const identity = await currentIdentity();
 if (!identity) redirect('/login');
 return <section><div className="sc-eyebrow">SETTINGS</div><h1>Account and authority</h1><p>Signed in subject {identity.subject}. The local owner account is nsharma_be24@thapar.edu. Actions are off. An approval record does not execute infrastructure.</p><PasskeySettings /></section>;
}
