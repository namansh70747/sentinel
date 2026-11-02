import { cookies } from 'next/headers';
import { getAuth, secureCookie } from '../../../../lib/auth';
export async function GET() {
 const auth = getAuth();
 if (!auth) return Response.json({ error: 'Configure OIDC and database before signing in.' },{ status:503 });
 try {
  const login = await auth.begin();
  (await cookies()).set('sentinel_login', login.browserToken, { httpOnly:true, secure:secureCookie(), sameSite:'lax', path:'/api/auth/callback', maxAge:600 });
  return Response.redirect(login.url);
 } catch { return Response.json({ error:'Unable to start login. Check identity-provider configuration.' },{ status:503 }); }
}
