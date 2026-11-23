import { ConnectorHttpClient,ConnectorHttpError } from './http';
import { parseBinding,parseSecret } from './config';
export type GitHubResource='commits'|'deployments'|'actions'|'checks'|'deployment-statuses';
export interface GitHubChange {kind:GitHubResource;externalId:string;providerId:string;revision?:string;status?:string;occurredAt:string;timeBasis:'provider'|'collected';title:string;url?:string}
export interface GitHubPageRequest {owner:string;repo:string;kind:GitHubResource;sha?:string;deploymentId?:number;workflowRunId?:number;pageUrl?:string;etag?:string;since?:string;until?:string}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ConnectorHttpError('invalid-response');return value as Record<string,unknown>;}
function text(value:unknown,max=500){if(typeof value!=='string')throw new ConnectorHttpError('invalid-response');return value.slice(0,max);}
function numberId(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<1)throw new ConnectorHttpError('invalid-response');return String(value);}
function revision(value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{40,64}$/i.test(value))throw new ConnectorHttpError('invalid-response');return value;}
function timestamp(value:unknown){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new ConnectorHttpError('invalid-response');return new Date(value).toISOString();}

/** Read-only API client: every continuation is pinned to the selected repo and resource. */
export class GitHubSyncClient {
 private readonly token:string;
 constructor(token:string,private readonly http:Pick<ConnectorHttpClient,'get'>=new ConnectorHttpClient()){
  this.token=parseSecret('github',{token}).token;if(!this.token)throw new Error('GitHub read credential required');
 }
 private clean(value:string){return value.replaceAll(this.token,'[REDACTED]');}
 private path(input:GitHubPageRequest){
  parseBinding('github',{owner:input.owner,repo:input.repo});const base=`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  if(input.kind==='commits')return base+'/commits';
  if(input.kind==='deployments')return base+'/deployments';
  if(input.kind==='actions')return base+'/actions/runs'+(input.workflowRunId?`/${numberId(input.workflowRunId)}`:'');
  if(input.kind==='checks')return base+`/commits/${revision(input.sha)}/check-runs`;
  return base+`/deployments/${numberId(input.deploymentId)}/statuses`;
 }
 private validateUrl(raw:string,path:string){
  const url=new URL(raw);
  if(url.origin!=='https://api.github.com'||url.pathname.toLowerCase()!==path.toLowerCase()||url.username||url.password||url.hash||url.href.includes(this.token))throw new ConnectorHttpError('endpoint-rejected');
  const allowed=['per_page','page','since','until','created','filter','sort','direction'];
  for(const [key,value]of url.searchParams){if(!allowed.includes(key)||value.length>256||/[\r\n\0]/.test(value))throw new ConnectorHttpError('endpoint-rejected');}
  if(url.searchParams.has('page')&&!/^[1-9]\d{0,4}$/.test(url.searchParams.get('page')!))throw new ConnectorHttpError('endpoint-rejected');
  const size=Number(url.searchParams.get('per_page')??100);if(!Number.isInteger(size)||size<1||size>100)throw new ConnectorHttpError('endpoint-rejected');
  return url;
 }
 requestUrl(input:GitHubPageRequest){
  const path=this.path(input),initial=new URL('https://api.github.com'+path);initial.searchParams.set('per_page','100');
  if(input.since&&input.kind==='commits')initial.searchParams.set('since',timestamp(input.since));
  if(input.until&&input.kind==='commits')initial.searchParams.set('until',timestamp(input.until));
  if(input.kind==='actions'&&!input.workflowRunId&&input.since&&input.until)initial.searchParams.set('created',`${timestamp(input.since)}..${timestamp(input.until)}`);
  const url=this.validateUrl(input.pageUrl??initial.href,path);
  for(const key of ['since','until','created'])if(url.searchParams.get(key)!==initial.searchParams.get(key))throw new ConnectorHttpError('endpoint-rejected');
  return url.href;
 }
 async page(input:GitHubPageRequest){
  const path=this.path(input),url=new URL(this.requestUrl(input));
  const headers:Record<string,string>={authorization:`Bearer ${this.token}`,accept:'application/vnd.github+json','user-agent':'Sentinel','X-GitHub-Api-Version':'2026-03-10'};
  if(input.etag){if(input.etag.length>512||/[\r\n\0]/.test(input.etag)||input.etag.includes(this.token))throw new ConnectorHttpError('invalid-response');headers['if-none-match']=input.etag;}
  const response=await this.http.get(url.href,headers);
  if(response.status===304){if(!input.etag)throw new ConnectorHttpError('invalid-response');return {records:[] as GitHubChange[],notModified:true,etag:input.etag,nextUrl:undefined as string|undefined};}
  let body:unknown;try{body=JSON.parse(response.text);}catch{throw new ConnectorHttpError('invalid-response');}
  const raw=input.kind==='actions'?(input.workflowRunId?[object(body)]:object(body).workflow_runs):input.kind==='checks'?object(body).check_runs:body;
  if(!Array.isArray(raw)||raw.length>100)throw new ConnectorHttpError('invalid-response');
  const records=raw.map(value=>this.normalize(input,object(value)));
  let nextUrl:string|undefined;
  const link=response.headers.link;
  if(typeof link==='string'){
   if(link.length>8192)throw new ConnectorHttpError('invalid-response');
   const match=link.split(',').map(part=>part.match(/<([^>]+)>\s*;\s*rel="next"/)).find(Boolean);
   if(match)nextUrl=this.requestUrl({...input,pageUrl:match[1]});
  }
  const etag=response.headers.etag;
  if(etag!==undefined&&(typeof etag!=='string'||etag.length>512||/[\r\n\0]/.test(etag)||etag.includes(this.token)))throw new ConnectorHttpError('invalid-response');
  return {records,notModified:false,etag:typeof etag==='string'?etag:undefined,nextUrl};
 }
 private normalize(input:GitHubPageRequest,row:Record<string,unknown>):GitHubChange {
  let id:string,sha:string|undefined,status:string|undefined,title:string,date:unknown,timeBasis:'provider'|'collected'='provider';
  if(input.kind==='commits'){
   sha=revision(row.sha);id=sha;const commit=object(row.commit);title=text(commit.message,4096).split('\n')[0];
   date=object(commit.committer??commit.author).date;status='committed';
  }else{
   id=numberId(row.id);
   if(input.kind==='deployments'){sha=revision(row.sha);title=`${text(row.environment,160)} deployment`;date=row.created_at;}
   else if(input.kind==='deployment-statuses'){sha=input.sha;status=text(row.state,80);if(!['error','failure','inactive','pending','success','queued','in_progress'].includes(status))throw new ConnectorHttpError('invalid-response');title=`Deployment ${input.deploymentId}: ${status}`;date=row.created_at;}
   else{
    sha=revision(row.head_sha);const state=text(row.status,80);if(!['queued','in_progress','completed','waiting','requested','pending'].includes(state))throw new ConnectorHttpError('invalid-response');status=state+(row.conclusion?`:${text(row.conclusion,80)}`:'');title=row.name===null||row.name===undefined?'GitHub workflow/check':text(row.name);
    date=input.kind==='actions'?row.updated_at:row.completed_at??row.started_at;
    if(date===null||date===undefined){date=new Date().toISOString();timeBasis='collected';}
   }
  }
  let url:string|undefined;
  if(typeof row.html_url==='string'){
   const target=new URL(row.html_url),prefix=`/${input.owner}/${input.repo}/`.toLowerCase();
   if(target.origin==='https://github.com'&&target.pathname.toLowerCase().startsWith(prefix)&&!target.username&&!target.password&&!target.href.includes(this.token))url=target.href;
  }
  if([id,sha].some(value=>value?.includes(this.token)))throw new ConnectorHttpError('invalid-response');
  return {kind:input.kind,providerId:id,externalId:`${input.kind==='commits'?'commit':input.kind}:${id}`,revision:sha,status:status?this.clean(status):undefined,occurredAt:timestamp(date),timeBasis,title:this.clean(title),url};
 }
}
