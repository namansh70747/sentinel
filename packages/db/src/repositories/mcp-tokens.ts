import { createHash,randomBytes,randomUUID } from 'node:crypto';
import type { SentinelDatabase } from '../index';
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export class McpTokenRepository {
 constructor(private readonly db:SentinelDatabase){}
 async issue(workspaceId:string,identityId:string,label:string){
  if(typeof label!=='string'||!label.trim()||label.length>160)throw new Error('Invalid MCP credential label');
  return this.db.inWorkspace(workspaceId,async client=>{
   const membership=(await client.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2',[workspaceId,identityId])).rows[0];
   if(membership?.role!=='admin')throw new Error('Workspace administrator required');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,5292))',[workspaceId]);
   const count=Number((await client.query('SELECT count(*) FROM mcp_access_tokens WHERE workspace_id=$1 AND revoked_at IS NULL AND expires_at>now()',[workspaceId])).rows[0].count);
   if(count>=20)throw new Error('Workspace MCP credential limit reached');
   const id=randomUUID(),token=randomBytes(32).toString('base64url');
   const row=(await client.query("INSERT INTO mcp_access_tokens(workspace_id,id,identity_id,label,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '7 days') RETURNING expires_at",[workspaceId,id,identityId,label.trim(),hash(token)])).rows[0];
   await this.db.appendAuditInTransaction(client,workspaceId,identityId,'mcp.credential-issued',{credentialId:id,label:label.trim(),expiresAt:row.expires_at});
   return {id,token,expiresAt:row.expires_at};
  });
 }
 async authorize(workspaceId:string,token:string){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  return this.db.inWorkspace(workspaceId,async client=>(await client.query(`SELECT t.id,t.identity_id,m.role FROM mcp_access_tokens t
   JOIN workspace_memberships m ON m.workspace_id=t.workspace_id AND m.identity_id=t.identity_id
   WHERE t.workspace_id=$1 AND t.token_hash=$2 AND t.revoked_at IS NULL AND t.expires_at>now()`,[workspaceId,hash(token)])).rows[0]??null);
 }
 async revoke(workspaceId:string,identityId:string,id:string){
  return this.db.inWorkspace(workspaceId,async client=>{
   const membership=(await client.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2',[workspaceId,identityId])).rows[0];
   if(membership?.role!=='admin')throw new Error('Workspace administrator required');
   const result=await client.query('UPDATE mcp_access_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE workspace_id=$1 AND id=$2 RETURNING id',[workspaceId,id]);
   if(result.rowCount)await this.db.appendAuditInTransaction(client,workspaceId,identityId,'mcp.credential-revoked',{credentialId:id});
  });
 }
}
