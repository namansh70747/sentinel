import { cookies } from 'next/headers';
import { getAuth, secureCookie } from '../../../../lib/auth';
export async function GET() {
 const auth = getAuth();
 if (!auth) return new Response(null, { status: 303, headers: { Location: '/login?error=unavailable' } });
 try {
  const login = await auth.begin();
  (await cookies()).set('sentinel_login', login.browserToken, { httpOnly:true, secure:secureCookie(), sameSite:'lax', path:'/api/auth/callback', maxAge:600 });
  return Response.redirect(login.url);
 } catch { return new Response(null, { status: 303, headers: { Location: '/login?error=unavailable' } }); }
}
