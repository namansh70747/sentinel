import { randomUUID } from 'node:crypto';
import { currentIdentity, getAuth, getDatabase } from '../../../lib/auth';
export async function GET() {
 const identity = await currentIdentity();
 if (!identity) return Response.json({error:'Authentication required'},{status:401});
 return Response.json(await getAuth()!.memberships(identity.id),{headers:{'cache-control':'no-store'}});
}
export async function POST(request: Request) {
 if (request.headers.get('origin') !== process.env.SENTINEL_PUBLIC_URL) return Response.json({error:'Invalid origin'},{status:403});
 const identity = await currentIdentity();
 if (!identity) return Response.json({error:'Authentication required'},{status:401});
 let body: {name?: unknown};
 try { body = await request.json(); } catch { return Response.json({error:'Invalid JSON'},{status:400}); }
 if (!body || typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 200) return Response.json({error:'Workspace name must contain 1–200 characters'},{status:400});
 const id = randomUUID(), name = body.name.trim(), db = getDatabase();
 await db.inWorkspace(id,async client => {
  await client.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[id,name]);
  await client.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'admin')",[id,identity.id]);
  await db.appendAuditInTransaction(client,id,identity.id,'workspace.created',{name});
 });
 return Response.json({workspace_id:id,name,role:'admin'},{status:201});
}
