import { auditHash } from "./audit";
export { auditHash, verifyAuditSegment } from "./audit";
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class SentinelDatabase {
 readonly pool: Pool;
 readonly orm: ReturnType<typeof drizzle>;
 constructor(connectionString: string) {
  this.pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  this.orm = drizzle(this.pool);
 }
 async inWorkspace<T>(workspaceId: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!uuid.test(workspaceId)) throw new Error('Invalid workspace identifier');
  const client = await this.pool.connect();
  try {
   await client.query('BEGIN');
   await client.query("SELECT set_config('sentinel.workspace_id', $1, true)", [workspaceId]);
   const result = await operation(client);
   await client.query('COMMIT');
   return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
 }
 async appendAudit(workspaceId: string, actor: string, action: string, payload: Record<string, unknown>) {
  return this.inWorkspace(workspaceId, client => this.appendAuditInTransaction(client, workspaceId, actor, action, payload));
 }
 async appendAuditInTransaction(client: PoolClient, workspaceId: string, actor: string, action: string, payload: Record<string, unknown>) {
   // Lock the workspace row: concurrent appends must extend one chain.
   const workspace = await client.query('SELECT id FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
   if (!workspace.rowCount) throw new Error('Workspace not found');
   const previous = await client.query('SELECT hash FROM audit_events WHERE workspace_id = $1 ORDER BY sequence DESC LIMIT 1', [workspaceId]);
   const previousHash = previous.rows[0]?.hash ?? '0'.repeat(64);
   const id = randomUUID();
   const persistedPayload = JSON.parse(JSON.stringify(payload));
   const hash = auditHash({workspaceId,id,actor,action,payload:persistedPayload,previousHash});
   const result = await client.query('INSERT INTO audit_events(workspace_id,id,actor,action,payload,previous_hash,hash,hash_version) VALUES($1,$2,$3,$4,$5,$6,$7,2) RETURNING *', [workspaceId,id,actor,action,persistedPayload,previousHash,hash]);
   return result.rows[0];
 }
 async close() { await this.pool.end(); }
}
