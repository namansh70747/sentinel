import 'server-only';
import { cookies } from 'next/headers';
import { PasskeyEnrollment } from '@sentinel/auth';
import { currentIdentity,getDatabase } from './auth';
export async function enrollmentAccess(request:Request) {
 if(request.headers.get('origin')!==process.env.SENTINEL_PUBLIC_URL)return {error:Response.json({error:'Invalid origin'},{status:403})} as const;
 const identity=await currentIdentity();
 if(!identity)return {error:Response.json({error:'Authentication required'},{status:401})} as const;
 if(Date.now()-new Date(identity.authenticated_at).getTime()>300000)return {error:Response.json({error:'Sign in again before adding a passkey.'},{status:401})} as const;
 const raw=(await cookies()).get('sentinel_session')!.value;
 return {identity,raw,enrollment:new PasskeyEnrollment(getDatabase(),process.env.SENTINEL_PUBLIC_URL!)} as const;
}
