import { cookies } from 'next/headers';
import { getAuth, secureCookie } from '../../../../lib/auth';
export async function GET(request: Request) {
 const auth = getAuth(), jar = await cookies();
 const browserToken = jar.get('sentinel_login')?.value;
 jar.set('sentinel_login','',{ path:'/api/auth/callback', maxAge:0 });
 if (!auth || !browserToken) return Response.json({ error:'Login expired. Start again.' },{ status:401 });
 try {
  const callback = new URL('/api/auth/callback',process.env.SENTINEL_PUBLIC_URL!);
  callback.search = new URL(request.url).search;
  const session = await auth.complete(browserToken,callback);
  jar.set('sentinel_session',session,{ httpOnly:true, secure:secureCookie(), sameSite:'lax', path:'/', maxAge:28800 });
  return Response.redirect(new URL('/dashboard',process.env.SENTINEL_PUBLIC_URL!));
 } catch { return Response.json({ error:'Login verification failed. Start again.' },{ status:401 }); }
}
