import { enrollmentAccess } from '../../../../../lib/passkeys';
export async function POST(request:Request) {
 const access=await enrollmentAccess(request);if(access.error)return access.error;
 return Response.json(await access.enrollment.begin(access.identity.id,access.raw),{headers:{'cache-control':'no-store'}});
}
