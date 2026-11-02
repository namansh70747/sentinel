export const dynamic = "force-dynamic";
import { getAuth } from '../../lib/auth';
export default function Login() {
 const configured = Boolean(getAuth());
 return <main className="product-dashboard"><h1>Sign in to Sentinel</h1><p className="product-lead">Use your organization’s identity provider to access your workspace.</p><section className="setup-panel"><div><h2>{configured ? 'Organization sign-in' : 'Identity provider setup required'}</h2><p>{configured ? 'Continue with your configured OpenID Connect provider.' : 'Configure DATABASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and SENTINEL_PUBLIC_URL on the server, then apply database migrations.'}</p>{configured && <a className="product-button" href="/api/auth/login">Continue with SSO</a>}</div></section></main>;
}
