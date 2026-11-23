import { createHash,randomUUID } from 'node:crypto';
import type { SentinelDatabase } from '../index';

export class RunbookError extends Error {
 constructor(message:string,readonly status=400){super(message);}
}
export interface RunbookImport {
 slug:string;title:string;sourcePath:string;markdown:string;serviceIds:string[];expectedVersion:number;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(input:RunbookImport){
 if(!input||typeof input!=='object'||typeof input.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(input.slug))throw new RunbookError('Use a lowercase slug containing letters, numbers and hyphens.');
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>160)throw new RunbookError('A title of at most 160 characters is required.');
 if(typeof input.sourcePath!=='string'||input.sourcePath.length>240||!input.sourcePath.endsWith('.md')||input.sourcePath.split('/').some(segment=>!segment||segment==='.'||segment==='..')||/[\\\u0000-\u001f:]/.test(input.sourcePath))throw new RunbookError('Use a relative Markdown source path.');
 if(typeof input.markdown!=='string'||!input.markdown.trim()||Buffer.byteLength(input.markdown)>262144||input.markdown.includes('\0'))throw new RunbookError('Markdown must contain text and fit within 256 KiB.');
 if(!Array.isArray(input.serviceIds)||input.serviceIds.length>50||input.serviceIds.some(id=>typeof id!=='string'||!uuid.test(id)))throw new RunbookError('Select up to 50 valid services.');
 if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)throw new RunbookError('An expected version is required.');
}

export class RunbookRepository {
 constructor(private readonly db:SentinelDatabase){}
 async import(workspaceId:string,actor:string,input:RunbookImport){
  validate(input);
  const serviceIds=[...new Set(input.serviceIds)].sort();
  const hash=createHash('sha256').update(JSON.stringify([input.title,input.sourcePath,input.markdown,serviceIds])).digest('hex');
  return this.db.inWorkspace(workspaceId,async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,5291))',[workspaceId]);
   const current=(await client.query('SELECT r.id,r.current_version,v.content_hash FROM runbooks r JOIN runbook_versions v ON v.workspace_id=r.workspace_id AND v.runbook_id=r.id AND v.version=r.current_version WHERE r.workspace_id=$1 AND r.slug=$2 FOR UPDATE OF r',[workspaceId,input.slug])).rows[0];
   // A lost HTTP response must be safe to retry with its original expected version.
   if(current?.content_hash===hash)return {id:current.id as string,version:current.current_version as number,unchanged:true};
   if((current?.current_version??0)!==input.expectedVersion)throw new RunbookError('Runbook changed. Reload the latest version before importing.',409);
   if(serviceIds.length&&(await client.query('SELECT id FROM services WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[workspaceId,serviceIds])).rowCount!==serviceIds.length)throw new RunbookError('A selected service does not belong to this workspace.');
   if(current?.current_version>=100)throw new RunbookError('Runbook version limit reached.',429);
   if(!current&&Number((await client.query('SELECT count(*) FROM runbooks WHERE workspace_id=$1',[workspaceId])).rows[0].count)>=500)throw new RunbookError('Workspace runbook limit reached.',429);
   const id=current?.id??randomUUID(),version=(current?.current_version??0)+1;
   if(!current)await client.query('INSERT INTO runbooks(workspace_id,id,slug,current_version) VALUES($1,$2,$3,$4)',[workspaceId,id,input.slug,version]);
   await client.query('INSERT INTO runbook_versions(workspace_id,runbook_id,version,title,markdown,source_path,content_hash,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[workspaceId,id,version,input.title,input.markdown,input.sourcePath,hash,actor]);
   for(const serviceId of serviceIds)await client.query('INSERT INTO runbook_service_links(workspace_id,runbook_id,version,service_id) VALUES($1,$2,$3,$4)',[workspaceId,id,version,serviceId]);
   if(current)await client.query('UPDATE runbooks SET current_version=$3 WHERE workspace_id=$1 AND id=$2',[workspaceId,id,version]);
   await this.db.appendAuditInTransaction(client,workspaceId,actor,'runbook.imported',{runbookId:id,version,contentHash:hash,serviceIds});
   return {id:id as string,version:version as number,unchanged:false};
  });
 }
 async search(workspaceId:string,query='',serviceId?:string){
  if(typeof query!=='string'||query.length>200)throw new RunbookError('Search text must fit within 200 characters.');
  if(serviceId&&!uuid.test(serviceId))throw new RunbookError('Invalid service identifier.');
  return this.db.inWorkspace(workspaceId,async client=>{
   const rows=(await client.query(`SELECT r.id,r.slug,v.version,v.title,v.source_path,v.imported_at,
    left(v.markdown,300) AS excerpt,CASE WHEN $2='' THEN 0 ELSE ts_rank(v.search_vector,plainto_tsquery('simple',$2)) END AS rank
    FROM runbooks r JOIN runbook_versions v ON v.workspace_id=r.workspace_id AND v.runbook_id=r.id AND v.version=r.current_version
    WHERE r.workspace_id=$1 AND ($2='' OR v.search_vector @@ plainto_tsquery('simple',$2))
    AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM runbook_service_links l WHERE l.workspace_id=r.workspace_id AND l.runbook_id=r.id AND l.version=v.version AND l.service_id=$3))
    ORDER BY rank DESC,v.imported_at DESC,r.id LIMIT 51`,[workspaceId,query.trim(),serviceId??null])).rows;
   return {items:rows.slice(0,50),truncated:rows.length>50};
  });
 }
 async get(workspaceId:string,id:string,version?:number){
  if(!uuid.test(id)||version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw new RunbookError('Invalid runbook or version.');
  return this.db.inWorkspace(workspaceId,async client=>{
   const row=(await client.query(`SELECT r.id,r.slug,r.current_version,v.version,v.title,v.markdown,v.source_path,v.content_hash,v.imported_at
    FROM runbooks r JOIN runbook_versions v ON v.workspace_id=r.workspace_id AND v.runbook_id=r.id AND v.version=coalesce($3,r.current_version)
    WHERE r.workspace_id=$1 AND r.id=$2`,[workspaceId,id,version??null])).rows[0];
   if(!row)return null;
   const versions=(await client.query('SELECT version,title,imported_at FROM runbook_versions WHERE workspace_id=$1 AND runbook_id=$2 ORDER BY version DESC LIMIT 100',[workspaceId,id])).rows;
   const services=(await client.query('SELECT service_id FROM runbook_service_links WHERE workspace_id=$1 AND runbook_id=$2 AND version=$3 ORDER BY service_id',[workspaceId,id,row.version])).rows.map(item=>item.service_id as string);
   return {...row,versions,serviceIds:services};
  });
 }
}
