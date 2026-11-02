import { cookies } from 'next/headers';
import { getAuth } from '../../../../lib/auth';
export async function POST(request: Request) {
 if (request.headers.get('origin') !== process.env.SENTINEL_PUBLIC_URL) return Response.json({ error:'Invalid origin' },{ status:403 });
 const jar = await cookies(), raw = jar.get('sentinel_session')?.value;
 if (raw) await getAuth()?.revoke(raw);
 jar.set('sentinel_session','',{ path:'/', maxAge:0 });
 return Response.json({ ok:true });
}
