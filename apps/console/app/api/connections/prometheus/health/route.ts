import { currentIdentity, getAuth, getDatabase } from "../../../../../lib/auth";
import { PrometheusClient } from '@sentinel/connectors';
export const dynamic = 'force-dynamic';
export async function GET() {
 if (getAuth() && !(await currentIdentity())) return Response.json({ error: "Authentication required" }, { status: 401 });
 const url = process.env.PROMETHEUS_URL;
 if (!url) return Response.json({ state: 'unconfigured', checkedAt: null, message: 'Set PROMETHEUS_URL on the console server to connect.' }, { headers: { 'cache-control': 'no-store' } });
 const identity=await currentIdentity();
 if(!identity)return Response.json({error:'Authentication required'},{status:401});
 const workspaceId=process.env.SENTINEL_CONFIG_WORKSPACE_ID;
 if(!workspaceId)return Response.json({state:'unconfigured',checkedAt:null,message:'Assign this server connection to SENTINEL_CONFIG_WORKSPACE_ID.'});
 const allowed=await getDatabase().pool.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2',[workspaceId,identity.id]);
 if(!allowed.rowCount)return Response.json({error:'Connection not found'},{status:404});
 try {
  const result = await new PrometheusClient({ url, token: process.env.PROMETHEUS_TOKEN, timeoutMs: 5000 }).health();
  return Response.json({ state: result.healthy ? 'connected' : 'unreachable', checkedAt: result.checkedAt, message: result.healthy ? 'Prometheus query endpoint verified.' : 'Connection failed. Check the server URL, credentials and network access.' }, { headers: { 'cache-control': 'no-store' } });
 } catch {
  return Response.json({ state: 'invalid', checkedAt: null, message: 'Invalid server connection configuration.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
 }
}
