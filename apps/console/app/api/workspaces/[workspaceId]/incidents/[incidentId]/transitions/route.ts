import { CollaborationRepository } from '@sentinel/db/collaboration';
import { getDatabase } from '../../../../../../../lib/auth';
import { isUuid, workspaceAccess } from '../../../../../../../lib/workspace-access';
const states = ['investigating', 'advised', 'escalated', 'verifying', 'recovered', 'closed', 'awaiting_approval', 'executing'];
export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; incidentId: string }> }) {
 if (request.headers.get('origin') !== process.env.SENTINEL_PUBLIC_URL) return Response.json({ error: 'Invalid origin' }, { status: 403 });
 const { workspaceId, incidentId } = await context.params;
 const access = await workspaceAccess(workspaceId);
 if (access.error) return access.error;
 if (!['admin', 'responder'].includes(access.role)) return Response.json({ error: 'Responder access required' }, { status: 403 });
 if (!isUuid(incidentId)) return Response.json({ error: 'Invalid incident identifier' }, { status: 400 });
 let body: { toState?: unknown; reason?: unknown; expectedVersion?: unknown };
 try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
 if (typeof body.toState !== 'string' || !states.includes(body.toState) || typeof body.reason !== 'string' || typeof body.expectedVersion !== 'number') return Response.json({ error: 'Provide a state, reason and expected version' }, { status: 400 });
 const result = await new CollaborationRepository(getDatabase()).transition(workspaceId, access.identity.id, incidentId, body.toState, body.reason, body.expectedVersion);
 if ('error' in result && result.error === 'missing') return Response.json({ error: 'Investigation not found' }, { status: 404 });
 if ('error' in result && result.error === 'conflict') return Response.json({ error: 'Incident changed. Reload and retry.' }, { status: 409 });
 if ('error' in result && result.error === 'unrecovered') return Response.json({ error: 'Recovery requires a live covered Prometheus result. Simulated evidence does not count.' }, { status: 409 });
 if ('error' in result) return Response.json({ error: 'That transition is not available from the current state' }, { status: 409 });
 return Response.json(result);
}
