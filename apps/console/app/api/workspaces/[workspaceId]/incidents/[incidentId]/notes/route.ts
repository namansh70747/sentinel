import { CollaborationRepository } from '@sentinel/db/collaboration';
import { getDatabase } from '../../../../../../../lib/auth';
import { isUuid, workspaceAccess } from '../../../../../../../lib/workspace-access';
export async function GET(_: Request, context: { params: Promise<{ workspaceId: string; incidentId: string }> }) {
 const { workspaceId, incidentId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 if (!isUuid(incidentId)) return Response.json({ error: 'Invalid incident identifier' }, { status: 400 });
 return Response.json(await new CollaborationRepository(getDatabase()).notes(workspaceId, incidentId), { headers: { 'cache-control': 'no-store' } });
}
export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; incidentId: string }> }) {
 if (request.headers.get('origin') !== process.env.SENTINEL_PUBLIC_URL) return Response.json({ error: 'Invalid origin' }, { status: 403 });
 const { workspaceId, incidentId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 if (!['admin', 'responder'].includes(access.role)) return Response.json({ error: 'Responder access required' }, { status: 403 });
 if (!isUuid(incidentId)) return Response.json({ error: 'Invalid incident identifier' }, { status: 400 });
 let body: { body?: unknown };
 try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
 if (typeof body.body !== 'string') return Response.json({ error: 'Note text is required' }, { status: 400 });
 try {
  const note = await new CollaborationRepository(getDatabase()).addNote(workspaceId, access.identity.id, incidentId, body.body);
  return note ? Response.json(note, { status: 201 }) : Response.json({ error: 'Investigation not found' }, { status: 404 });
 } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to record note' }, { status: 400 }); }
}
