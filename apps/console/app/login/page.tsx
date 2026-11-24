import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, KeyRound } from 'lucide-react';
import { redirect } from 'next/navigation';
import { currentIdentity, getAuth } from '../../lib/auth';

export const dynamic = 'force-dynamic';

const errors: Record<string, string> = {
 unavailable: 'Sentinel could not reach your identity provider. Try again or contact your workspace administrator.',
 expired: 'Your sign-in attempt expired. Start again to continue.',
 verification: 'Sentinel could not verify this sign-in. Try again with your organization account.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
 const configured = Boolean(getAuth());
 if (configured && await currentIdentity()) redirect('/dashboard');
 const { error } = await searchParams;
 const message = typeof error === 'string' && Object.hasOwn(errors, error) ? errors[error] : null;

 return <section className="desk-login desk-enter">
  <div className="desk-login-icon"><KeyRound size={25} aria-hidden="true"/></div>
  <h1>Sign in to Sentinel</h1>
  <p>Access your workspace with your organization account.</p>
  {message && <p className="desk-login-error" role="alert">{message}</p>}
  {configured ? <a className="desk-login-button" href="/api/auth/login">Continue with SSO <ArrowUpRight size={17}/></a> :
   <div className="desk-login-setup">
    <h2>Organization sign-in is unavailable</h2>
    <p>Ask your administrator to configure the identity provider and database for this workspace.</p>
   </div>}
  <Link className="desk-login-demo" href="/demo/showcase"><ArrowLeft size={15}/> Explore the demo</Link>
 </section>;
}
