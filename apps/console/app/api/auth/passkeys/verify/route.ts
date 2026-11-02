import { enrollmentAccess } from '../../../../../lib/passkeys';
export async function POST(request:Request) {
 const access=await enrollmentAccess(request);if(access.error)return access.error;
 try {const body=await request.json();if(typeof body?.challengeId!=='string'||!body.response)return Response.json({error:'Invalid enrollment response'},{status:400});return Response.json(await access.enrollment.complete(access.identity.id,access.raw,body.challengeId,body.response));}
 catch {return Response.json({error:'Passkey verification failed or enrollment expired. Start again.'},{status:400});}
}
