import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { SentinelDatabase } from '@sentinel/db';
try{loadEnvFile('.local/compose.env');}catch{}
const owner=JSON.parse(await readFile('.local/owner.json','utf8'));
const url=process.env.DATABASE_URL??`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD??'')}@127.0.0.1:55441/sentinel`;
const address=new URL(url);
if(address.pathname!=='/sentinel'||!['localhost','127.0.0.1','postgres'].includes(address.hostname))throw new Error('Owner bootstrap is restricted to the local Sentinel database');
const db=new SentinelDatabase(url);
try{
 await db.inWorkspace(owner.workspaceId,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(75489323)');
  const identity=(await client.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3) ON CONFLICT(issuer,subject) DO UPDATE SET subject=EXCLUDED.subject RETURNING id',[randomUUID(),owner.issuer,owner.subject])).rows[0];
  const inserted=await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Sentinel Local') ON CONFLICT(id) DO NOTHING RETURNING id",[owner.workspaceId]);
  // Preserve any existing membership, including an intentionally reduced role.
  await client.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'admin') ON CONFLICT(workspace_id,identity_id) DO NOTHING",[owner.workspaceId,identity.id]);
  if(inserted.rowCount)await db.appendAuditInTransaction(client,owner.workspaceId,'local-bootstrap','workspace.created',{name:'Sentinel Local',local:true});
 });
 console.log('Local owner identity and workspace ensured. Password: .local/keycloak/owner-password');
}finally{await db.close();}
