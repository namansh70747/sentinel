import { CollaborationRepository } from '@sentinel/db/collaboration';
import { getDatabase } from '../../../../../lib/auth';
import { workspaceAccess } from '../../../../../lib/workspace-access';
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
 const { workspaceId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 const cursor = Number(new URL(request.url).searchParams.get('cursor') ?? '0');
 if (!Number.isInteger(cursor) || cursor < 0) return Response.json({ error: 'Invalid cursor' }, { status: 400 });
 const events = await new CollaborationRepository(getDatabase()).events(workspaceId, cursor);
 const encoder = new TextEncoder();
 const stream = new ReadableStream({
  start(controller) {
   for (const event of events) controller.enqueue(encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`));
   controller.enqueue(encoder.encode(': heartbeat\n\n'));
   controller.close();
  },
 });
 return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'close' } });
}
