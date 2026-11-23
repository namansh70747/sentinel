import type { SentinelDatabase } from '@sentinel/db';
import type { ConnectorRepository } from '@sentinel/db/connectors';
import { GitHubSyncRepository } from '@sentinel/db/github-sync';
import { GitHubSyncClient } from '@sentinel/connectors/github-sync';
import { ConnectorHttpClient,ConnectorHttpError } from '@sentinel/connectors/http';
export class GitHubSynchronizer {
 private cursor='00000000-0000-0000-0000-000000000000';
 private discovered=new Map<string,number>();
 constructor(private readonly db:SentinelDatabase,private readonly connections:ConnectorRepository,private readonly repository:GitHubSyncRepository,private readonly clientFactory=(token:string)=>new GitHubSyncClient(token,new ConnectorHttpClient({deadlineAt:Date.now()+20000}))){}
 async tick(){
  const workspaces=(await this.db.pool.query('SELECT id FROM workspaces WHERE id>$1 ORDER BY id LIMIT 25',[this.cursor])).rows;
  if(!workspaces.length){this.cursor='00000000-0000-0000-0000-000000000000';return;}
  for(const workspace of workspaces){
   this.cursor=workspace.id;
   if(Date.now()-(this.discovered.get(workspace.id)??0)>=300000){await this.repository.discover(workspace.id);this.discovered.set(workspace.id,Date.now());}
   const resource=await this.repository.claim(workspace.id);if(!resource)continue;
   try{
    const connection=await this.connections.resolve(workspace.id,resource.service_id,'github');
    if(!connection||connection.id!==resource.connector_id||connection.configVersion!==resource.config_version||String(connection.mapping.owner).toLowerCase()!==resource.spec.owner.toLowerCase()||String(connection.mapping.repo).toLowerCase()!==resource.spec.repo.toLowerCase()){
     await this.repository.fail(resource,'binding-or-configuration-changed',300000,true);return;
    }
    if(!connection.secret.token){await this.repository.fail(resource,'credential-required');return;}
    const until=resource.cursor.until??new Date().toISOString();
    const since=resource.cursor.since??(resource.cursor.watermark?new Date(Date.parse(resource.cursor.watermark)-60000).toISOString():new Date(Date.now()-(resource.spec.kind==='actions'?30:1)*86400000).toISOString());
    const request={...resource.spec,pageUrl:resource.cursor.nextUrl,since,until};
    const client=this.clientFactory(connection.secret.token),url=client.requestUrl(request);
    const page=await client.page({...request,etag:!resource.cursor.nextUrl&&!resource.cursor.hadPagination&&resource.cursor.headUrl===url?resource.cursor.headEtag:undefined});
    await this.repository.persist(resource,page,url,{since,until});
   }catch(error){await this.repository.fail(resource,error instanceof ConnectorHttpError?error.code:'invalid-response',error instanceof ConnectorHttpError?error.retryAfterMs:undefined);}
   return;
  }
 }
}
