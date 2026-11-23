import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SentinelDatabase } from '../index';
import type { GitHubChange,GitHubPageRequest } from '@sentinel/connectors/github-sync';
import { ConnectorStateError } from './connectors';
interface Cursor {nextUrl?:string;headUrl?:string;headEtag?:string;since?:string;until?:string;watermark?:string;count?:number;pages?:number;completed?:boolean;firstSeenAt?:string;outcome?:string;allCompleted?:boolean;hasRecords?:boolean;newestDeploymentState?:string;lastEmpty?:boolean;hadPagination?:boolean}
export interface GitHubSyncResource {workspace_id:string;service_id:string;connector_id:string;config_version:number;resource_key:string;spec:GitHubPageRequest;cursor:Cursor;lease_id:string;record_count:number}
export function githubResourceKey(spec:GitHubPageRequest){return `${spec.owner.toLowerCase()}/${spec.repo.toLowerCase()}:${spec.kind}:${spec.sha??''}:${spec.deploymentId??''}:${spec.workflowRunId??''}`;}
export class GitHubSyncRepository {
 constructor(private readonly db:SentinelDatabase){}
 private async seed(client:PoolClient,workspaceId:string,connectorId?:string){
  const obsolete=await client.query(`UPDATE github_sync_resources r SET status='disabled',error_code='binding-or-configuration-changed',last_failure_at=now(),lease_id=NULL,lease_at=NULL
   WHERE r.workspace_id=$1 AND r.status<>'disabled' AND NOT EXISTS(SELECT 1 FROM service_connector_bindings b JOIN connector_instances c ON c.workspace_id=b.workspace_id AND c.id=b.connector_id
    WHERE b.workspace_id=r.workspace_id AND b.service_id=r.service_id AND b.connector_id=r.connector_id AND b.provider='github' AND c.mode='live' AND c.config_version=r.config_version
     AND lower(b.mapping->>'owner')=lower(r.spec->>'owner') AND lower(b.mapping->>'repo')=lower(r.spec->>'repo')) RETURNING connector_id`,[workspaceId]);
  for(const id of new Set(obsolete.rows.map(row=>row.connector_id)))await client.query("UPDATE connector_sync_requests SET status='failed',finished_at=now() WHERE workspace_id=$1 AND connector_id=$2 AND status IN ('queued','running')",[workspaceId,id]);
  const bindings=(await client.query("SELECT b.service_id,b.mapping,c.id,c.config_version FROM service_connector_bindings b JOIN connector_instances c ON c.workspace_id=b.workspace_id AND c.id=b.connector_id WHERE b.workspace_id=$1 AND b.provider='github' AND c.mode='live' AND ($2::uuid IS NULL OR c.id=$2)",[workspaceId,connectorId??null])).rows;
  for(const binding of bindings)for(const kind of ['commits','deployments','actions'] as const){
   const spec={owner:String(binding.mapping.owner),repo:String(binding.mapping.repo),kind};
   await client.query("INSERT INTO github_sync_resources(workspace_id,service_id,connector_id,config_version,resource_key,spec) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id,service_id,connector_id,config_version,resource_key) DO UPDATE SET status='pending',error_code=NULL,cursor='{}',next_due_at=now() WHERE github_sync_resources.status='disabled'",[workspaceId,binding.service_id,binding.id,binding.config_version,githubResourceKey(spec),spec]);
  }
  return bindings;
 }
 async discover(workspaceId:string){return this.db.inWorkspace(workspaceId,client=>this.seed(client,workspaceId));}
 async request(workspaceId:string,actor:string,connectorId:string){return this.db.inWorkspace(workspaceId,async client=>{
  const connector=(await client.query("SELECT config_version FROM connector_instances WHERE workspace_id=$1 AND id=$2 AND provider='github' AND mode='live' FOR UPDATE",[workspaceId,connectorId])).rows[0];
  if(!connector)throw new ConnectorStateError('not-found','Enabled GitHub connection not found');
  const bindings=await this.seed(client,workspaceId,connectorId);if(!bindings.length)throw new ConnectorStateError('not-found','Map this connection to a service repository first');
  const pending=(await client.query("SELECT id,status,config_version FROM connector_sync_requests WHERE workspace_id=$1 AND connector_id=$2 AND status IN ('queued','running')",[workspaceId,connectorId])).rows[0];
  if(pending&&pending.config_version===connector.config_version)return {id:pending.id,status:pending.status};
  if(pending)await client.query("UPDATE connector_sync_requests SET status='failed',finished_at=now() WHERE workspace_id=$1 AND id=$2",[workspaceId,pending.id]);
  await client.query("UPDATE github_sync_resources SET status=CASE WHEN status='complete' THEN 'pending' ELSE status END,next_due_at=CASE WHEN error_code='rate-limited' THEN greatest(next_due_at,now()) ELSE now() END WHERE workspace_id=$1 AND connector_id=$2 AND config_version=$3 AND status<>'disabled'",[workspaceId,connectorId,connector.config_version]);
  const id=randomUUID();await client.query('INSERT INTO connector_sync_requests(workspace_id,id,connector_id,config_version,requested_by,created_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())',[workspaceId,id,connectorId,connector.config_version,actor]);
  await this.db.appendAuditInTransaction(client,workspaceId,actor,'connector.sync-requested',{connectorId,syncId:id,configVersion:connector.config_version});return {id,status:'queued'};
 });}
 async requests(workspaceId:string,connectorId:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query('SELECT id,status,record_count,created_at,finished_at FROM connector_sync_requests WHERE workspace_id=$1 AND connector_id=$2 ORDER BY created_at DESC LIMIT 20',[workspaceId,connectorId])).rows);}
 async health(workspaceId:string,connectorId:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query(`SELECT r.service_id,r.config_version,r.spec->>'owner' AS owner,r.spec->>'repo' AS repo,r.spec->>'kind' AS capability,
   CASE WHEN bool_or(r.status='failed') THEN 'failed' WHEN bool_or(r.status IN ('pending','running','partial')) THEN 'pending'
    WHEN bool_or(r.status='ok' AND r.next_due_at<now()-interval '1 minute') THEN 'stale'
    WHEN bool_and(r.cursor->>'outcome'='empty') THEN 'empty' WHEN bool_and(r.cursor->>'outcome'='not-modified') THEN 'unchanged' ELSE 'ok' END AS status,
   min(r.last_success_at) AS last_success_at,sum(r.record_count)::bigint AS record_count,max(r.error_code) AS error_code,greatest(min(r.next_due_at),max(c.sync_backoff_until)) AS next_due_at
   FROM github_sync_resources r JOIN connector_instances c ON c.workspace_id=r.workspace_id AND c.id=r.connector_id AND c.config_version=r.config_version
   WHERE r.workspace_id=$1 AND r.connector_id=$2 AND r.status<>'disabled' GROUP BY r.service_id,r.config_version,r.spec->>'owner',r.spec->>'repo',r.spec->>'kind' LIMIT 100`,[workspaceId,connectorId])).rows);}
 async claim(workspaceId:string){return this.db.inWorkspace(workspaceId,async client=>{
  const row=(await client.query("SELECT r.* FROM github_sync_resources r JOIN connector_instances c ON c.workspace_id=r.workspace_id AND c.id=r.connector_id AND c.config_version=r.config_version WHERE r.workspace_id=$1 AND c.mode='live' AND (c.sync_backoff_until IS NULL OR c.sync_backoff_until<=now()) AND r.status NOT IN ('disabled','complete') AND next_due_at<=now() AND (lease_at IS NULL OR lease_at<now()-interval '2 minutes') ORDER BY CASE WHEN spec->>'kind' IN ('commits','deployments','actions') AND NOT spec ? 'workflowRunId' THEN 0 ELSE 1 END,next_due_at LIMIT 1 FOR UPDATE OF r SKIP LOCKED",[workspaceId])).rows[0];if(!row)return null;
  const lease=randomUUID();await client.query("UPDATE github_sync_resources SET lease_id=$1,lease_at=now(),status='running' WHERE workspace_id=$2 AND service_id=$3 AND connector_id=$4 AND config_version=$5 AND resource_key=$6",[lease,workspaceId,row.service_id,row.connector_id,row.config_version,row.resource_key]);
  await client.query("UPDATE connector_sync_requests SET status='running' WHERE workspace_id=$1 AND connector_id=$2 AND status='queued'",[workspaceId,row.connector_id]);return {...row,lease_id:lease} as GitHubSyncResource;
 });}
 async persist(resource:GitHubSyncResource,page:{records:GitHubChange[];notModified:boolean;etag?:string;nextUrl?:string},requestUrl:string,window:{since?:string;until:string}){
  return this.db.inWorkspace(resource.workspace_id,async client=>{
   const keys=[resource.workspace_id,resource.service_id,resource.connector_id,resource.config_version,resource.resource_key];
   const locked=(await client.query('SELECT cursor FROM github_sync_resources WHERE workspace_id=$1 AND service_id=$2 AND connector_id=$3 AND config_version=$4 AND resource_key=$5 AND lease_id=$6 FOR UPDATE',[...keys,resource.lease_id])).rows[0];if(!locked)return false;
   const cursor:Cursor=locked.cursor,first=!cursor.nextUrl;
   for(const change of page.records){
    await client.query(`INSERT INTO github_changes(workspace_id,service_id,connector_id,config_version,resource_key,external_id,kind,provider_id,revision,status,occurred_at,time_basis,title,url)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(workspace_id,service_id,connector_id,external_id) DO UPDATE SET resource_key=EXCLUDED.resource_key,config_version=EXCLUDED.config_version,status=EXCLUDED.status,
      occurred_at=CASE WHEN EXCLUDED.time_basis='collected' AND github_changes.status IS NOT DISTINCT FROM EXCLUDED.status AND github_changes.title=EXCLUDED.title THEN github_changes.occurred_at ELSE EXCLUDED.occurred_at END,
      time_basis=CASE WHEN EXCLUDED.time_basis='collected' AND github_changes.status IS NOT DISTINCT FROM EXCLUDED.status AND github_changes.title=EXCLUDED.title THEN github_changes.time_basis ELSE EXCLUDED.time_basis END,title=EXCLUDED.title,url=EXCLUDED.url,collected_at=now()
      WHERE NOT(EXCLUDED.time_basis='provider' AND github_changes.time_basis='provider' AND EXCLUDED.occurred_at<github_changes.occurred_at)
       AND (github_changes.config_version IS DISTINCT FROM EXCLUDED.config_version OR github_changes.status IS DISTINCT FROM EXCLUDED.status OR (EXCLUDED.time_basis='provider' AND github_changes.occurred_at IS DISTINCT FROM EXCLUDED.occurred_at) OR github_changes.title IS DISTINCT FROM EXCLUDED.title OR github_changes.url IS DISTINCT FROM EXCLUDED.url)`,[...keys,`${resource.spec.owner.toLowerCase()}/${resource.spec.repo.toLowerCase()}:${change.externalId}`,change.kind,change.providerId,change.revision??null,change.status??null,change.occurredAt,change.timeBasis,change.title,change.url??null]);
    const children:GitHubPageRequest[]=[];
    if(change.kind==='commits'&&change.revision)children.push({owner:resource.spec.owner,repo:resource.spec.repo,kind:'checks',sha:change.revision});
    if(change.kind==='deployments')children.push({owner:resource.spec.owner,repo:resource.spec.repo,kind:'deployment-statuses',deploymentId:Number(change.providerId),sha:change.revision});
    let activeAction=change.kind==='actions'&&!resource.spec.workflowRunId&&!change.status?.startsWith('completed');
    if(activeAction){const latest=(await client.query('SELECT occurred_at,status FROM github_changes WHERE workspace_id=$1 AND service_id=$2 AND connector_id=$3 AND external_id=$4',[...keys.slice(0,3),`${resource.spec.owner.toLowerCase()}/${resource.spec.repo.toLowerCase()}:${change.externalId}`])).rows[0];if(latest?.status?.startsWith('completed')&&new Date(latest.occurred_at).getTime()>Date.parse(change.occurredAt))activeAction=false;}
    if(activeAction){children.push({owner:resource.spec.owner,repo:resource.spec.repo,kind:'actions',workflowRunId:Number(change.providerId)});if(change.revision)children.push({owner:resource.spec.owner,repo:resource.spec.repo,kind:'checks',sha:change.revision});}
    for(const child of children)await client.query(`INSERT INTO github_sync_resources(workspace_id,service_id,connector_id,config_version,resource_key,spec) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(workspace_id,service_id,connector_id,config_version,resource_key) DO UPDATE SET status='pending',error_code=NULL,next_due_at=now()
     WHERE github_sync_resources.status='disabled' OR ($7 AND github_sync_resources.status='complete')`,[...keys.slice(0,4),githubResourceKey(child),child,activeAction]);
   }
   const count=page.notModified?resource.record_count:(first?0:cursor.count??0)+page.records.length,pages=(first?0:cursor.pages??0)+1;
   const firstSeenAt=cursor.firstSeenAt??window.until;
   const allCompleted=page.notModified?cursor.allCompleted===true:(first||cursor.allCompleted!==false)&&page.records.every(change=>change.status?.startsWith('completed'));
   const hasRecords=page.notModified?cursor.hasRecords===true:(!first&&cursor.hasRecords===true)||page.records.length>0;
   const newestDeploymentState=page.notModified||!first?cursor.newestDeploymentState:page.records[0]?.status;
   const lastEmpty=page.notModified?(cursor.lastEmpty??cursor.outcome==='empty'):!hasRecords;
   const terminal=!page.nextUrl&&(
    ((resource.spec.workflowRunId!==undefined||resource.spec.kind==='checks')&&hasRecords&&allCompleted)
    ||(resource.spec.kind==='deployment-statuses'&&newestDeploymentState==='inactive')
    ||(['checks','deployment-statuses'].includes(resource.spec.kind)&&lastEmpty&&Date.now()-Date.parse(firstSeenAt)>=86400000)
    ||(page.notModified&&cursor.completed===true));
   const next:Cursor={headUrl:first?requestUrl:cursor.headUrl,headEtag:first?page.etag:cursor.headEtag,watermark:page.nextUrl?cursor.watermark:window.until,completed:terminal,firstSeenAt,allCompleted,hasRecords,newestDeploymentState,lastEmpty,hadPagination:page.notModified?cursor.hadPagination:!first||Boolean(page.nextUrl),outcome:page.notModified?(lastEmpty?'empty':'not-modified'):hasRecords?'verified-read':'empty',...(page.nextUrl?{nextUrl:page.nextUrl,since:window.since,until:window.until,count,pages:pages>=10?0:pages}:{})};
   await client.query(`UPDATE github_sync_resources SET cursor=$1,status=$2,record_count=$3,last_success_at=CASE WHEN $4 THEN last_success_at ELSE now() END,error_code=NULL,lease_id=NULL,lease_at=NULL,next_due_at=now()+($5::int*interval '1 second') WHERE workspace_id=$6 AND service_id=$7 AND connector_id=$8 AND config_version=$9 AND resource_key=$10`,[next,page.nextUrl?'partial':terminal?'complete':'ok',count,Boolean(page.nextUrl),page.nextUrl&&pages<10?0:300,...keys]);
   await this.settle(client,resource.workspace_id,resource.connector_id);return true;
  });
 }
 async fail(resource:GitHubSyncResource,errorCode:string,retryAfterMs=300000,disabled=false){return this.db.inWorkspace(resource.workspace_id,async client=>{
  if(errorCode==='rate-limited')await client.query("UPDATE connector_instances SET sync_backoff_until=greatest(sync_backoff_until,clock_timestamp()+($4::int*interval '1 millisecond')) WHERE workspace_id=$1 AND id=$2 AND config_version=$3",[resource.workspace_id,resource.connector_id,resource.config_version,Math.min(86400000,Math.max(300000,retryAfterMs))]);
  await client.query("UPDATE github_sync_resources SET status=$1,error_code=$2,last_failure_at=now(),lease_id=NULL,lease_at=NULL,next_due_at=now()+($3::int*interval '1 millisecond') WHERE workspace_id=$4 AND service_id=$5 AND connector_id=$6 AND config_version=$7 AND resource_key=$8 AND lease_id=$9",[disabled?'disabled':'failed',errorCode,Math.min(86400000,Math.max(300000,retryAfterMs)),resource.workspace_id,resource.service_id,resource.connector_id,resource.config_version,resource.resource_key,resource.lease_id]);
  await this.settle(client,resource.workspace_id,resource.connector_id);
 });}
 private async settle(client:PoolClient,workspaceId:string,connectorId:string){
  await client.query(`UPDATE connector_sync_requests q SET status=CASE WHEN EXISTS(SELECT 1 FROM github_sync_resources r WHERE r.workspace_id=q.workspace_id AND r.connector_id=q.connector_id AND r.config_version=q.config_version AND r.last_failure_at>=q.created_at AND r.status IN ('failed','disabled')) THEN 'failed' ELSE 'succeeded' END,
   record_count=(SELECT coalesce(sum(r.record_count),0)::int FROM github_sync_resources r WHERE r.workspace_id=q.workspace_id AND r.connector_id=q.connector_id AND r.config_version=q.config_version),finished_at=now()
   WHERE q.workspace_id=$1 AND q.connector_id=$2 AND q.status IN ('queued','running') AND (
    EXISTS(SELECT 1 FROM github_sync_resources r WHERE r.workspace_id=q.workspace_id AND r.connector_id=q.connector_id AND r.config_version=q.config_version AND r.last_failure_at>=q.created_at AND r.status IN ('failed','disabled'))
    OR NOT EXISTS(SELECT 1 FROM github_sync_resources r WHERE r.workspace_id=q.workspace_id AND r.connector_id=q.connector_id AND r.config_version=q.config_version AND r.status<>'disabled' AND (r.last_success_at IS NULL OR r.last_success_at<q.created_at OR r.status IN ('pending','running','partial'))))`,[workspaceId,connectorId]);
 }
 async changes(workspaceId:string,serviceId:string){return this.db.inWorkspace(workspaceId,async client=>(await client.query('SELECT kind,external_id,revision,status,occurred_at,time_basis,title,url,collected_at,connector_id,config_version FROM github_changes WHERE workspace_id=$1 AND service_id=$2 ORDER BY occurred_at DESC LIMIT 100',[workspaceId,serviceId])).rows);}
 async observations(workspaceId:string,serviceId:string,connectorId:string,configVersion:number,owner:string,repo:string,now:number){return this.db.inWorkspace(workspaceId,async client=>{
  const keys=[workspaceId,serviceId,connectorId,configVersion,owner.toLowerCase(),repo.toLowerCase()];
  const cutoff=new Date(now);
  const resources=(await client.query(`SELECT observation->'spec'->>'kind' AS capability,observation->>'status' AS status,
   (observation->>'last_success_at')::timestamptz AS last_success_at,observation->>'error_code' AS error_code
   FROM (SELECT DISTINCT ON(object_key) observation FROM github_observation_history
    WHERE workspace_id=$1 AND service_id=$2 AND connector_id=$3 AND config_version=$4 AND object_type='resource' AND recorded_at<=$7
    ORDER BY object_key,recorded_at DESC,sequence DESC) latest
   WHERE lower(observation->'spec'->>'owner')=$5 AND lower(observation->'spec'->>'repo')=$6 AND observation->>'status'<>'disabled' LIMIT 1001`,[...keys,cutoff])).rows;
  const changes=(await client.query(`WITH latest AS (
   SELECT DISTINCT ON(object_key) observation FROM github_observation_history
   WHERE workspace_id=$1 AND service_id=$2 AND connector_id=$3 AND config_version=$4 AND object_type='change' AND recorded_at<=$8
   ORDER BY object_key,recorded_at DESC,sequence DESC)
   SELECT observation->>'kind' AS kind,observation->>'external_id' AS external_id,observation->>'revision' AS revision,
    observation->>'status' AS status,(observation->>'occurred_at')::timestamptz AS occurred_at,observation->>'time_basis' AS time_basis,
    observation->>'title' AS title,observation->>'url' AS url,(observation->>'collected_at')::timestamptz AS collected_at
   FROM latest WHERE lower(split_part(observation->>'external_id',':',1))=$5||'/'||$6
    AND (observation->>'occurred_at')::timestamptz BETWEEN $7 AND $8
   ORDER BY (observation->>'occurred_at')::timestamptz DESC LIMIT 101`,[...keys,new Date(now-900000),cutoff])).rows;
  return {resources:resources.slice(0,1000),resourcesTruncated:resources.length>1000,changes:changes.slice(0,100),changesTruncated:changes.length>100,queryWindow:{start:new Date(now-900000).toISOString(),end:cutoff.toISOString()}};
 });}
}
