import { ConnectorHttpClient,ConnectorHttpError } from './http';
import { localKubernetesTarget } from './config';
export interface KubernetesRecord {kind:'pod'|'deployment'|'service'|'event';name:string;namespace:string;uid:string;phase?:string;ready?:number;desired?:number;restarts?:number;reason?:string;message?:string;providerTimestamp?:string}
export interface KubernetesSnapshot {namespace:string;observedAt:string;records:KubernetesRecord[];truncated:boolean;selector:string}
function object(value:unknown):Record<string,any>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ConnectorHttpError('invalid-response');return value as Record<string,any>;}
function count(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>1000000)throw new ConnectorHttpError('invalid-response');return Number(value);}
export class KubernetesReader {
 private readonly base:string;
 private readonly http:Pick<ConnectorHttpClient,'json'>;
 constructor(private readonly config:{endpoint:string;namespace:string;certificateAuthority?:string},private readonly token:string,http?:Pick<ConnectorHttpClient,'json'>){
  const url=new URL(config.endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/.test(config.namespace))throw new Error('Invalid Kubernetes endpoint or namespace');
  if(!token||token.length>8192||/[\r\n\0]/.test(token))throw new Error('Kubernetes reader token required');
  if(!http&&(url.origin!==localKubernetesTarget.endpoint||config.namespace!==localKubernetesTarget.namespace))throw new Error('Only the dedicated local Kubernetes fixture is enabled');
  this.base=url.origin;this.http=http??new ConnectorHttpClient({certificateAuthority:config.certificateAuthority,deadlineAt:Date.now()+20000});
 }
 async collect(selector?:string):Promise<KubernetesSnapshot>{
  if(selector!==undefined&&(!/^[A-Za-z0-9._/-]+=[A-Za-z0-9._-]+(?:,[A-Za-z0-9._/-]+=[A-Za-z0-9._-]+){0,4}$/.test(selector)||selector.length>512))throw new Error('Explicit equality label selector required');
  const clean=(value:unknown,max=500)=>String(value??'').replaceAll(this.token,'[REDACTED]').slice(0,max);
  const records:KubernetesRecord[]=[],uids=new Set<string>();let truncated=false;
  const resources=[['pod','/api/v1','pods'],['deployment','/apis/apps/v1','deployments'],['service','/api/v1','services'],['event','/api/v1','events']] as const;
  for(const [kind,prefix,plural]of resources){
   let continuation:string|undefined;
   for(let page=0;page<2;page++){
    const url=new URL(`${this.base}${prefix}/namespaces/${encodeURIComponent(this.config.namespace)}/${plural}`);url.searchParams.set('limit','100');if(kind!=='event'&&selector!==undefined)url.searchParams.set('labelSelector',selector);if(continuation)url.searchParams.set('continue',continuation);
    const body=object(await this.http.json(url.href,{authorization:`Bearer ${this.token}`}));
    if(!Array.isArray(body.items)||body.items.length>100)throw new ConnectorHttpError('invalid-response');
    for(const raw of body.items){
     const item=object(raw),meta=object(item.metadata);if(meta.namespace!==this.config.namespace)throw new ConnectorHttpError('invalid-response');
     if(typeof meta.name!=='string'||meta.name.length>253)throw new ConnectorHttpError('invalid-response');
     if(kind==='event'&&!uids.has(String(item.involvedObject?.uid)))continue;
     const row:KubernetesRecord={kind,name:clean(meta.name,253),namespace:this.config.namespace,uid:clean(meta.uid,128)};
     if(kind==='pod'){
      const statuses=item.status?.containerStatuses??[];if(!Array.isArray(statuses)||statuses.length>100)throw new ConnectorHttpError('invalid-response');
      row.phase=clean(item.status?.phase,80);row.ready=statuses.filter(status=>status.ready===true).length;row.desired=Array.isArray(item.spec?.containers)?item.spec.containers.length:0;row.restarts=statuses.reduce((total,status)=>total+count(status.restartCount??0),0);
      const waiting=statuses.find(status=>status.state?.waiting)?.state.waiting;row.reason=clean(waiting?.reason??item.status?.reason,120);row.message=clean(waiting?.message??item.status?.message);
     }else if(kind==='deployment'){row.ready=count(item.status?.readyReplicas??0);row.desired=count(item.spec?.replicas??1);}
     else if(kind==='event'){row.reason=clean(item.reason,120);row.message=clean(item.message);const stamp=item.lastTimestamp??item.eventTime??meta.creationTimestamp;if(typeof stamp==='string'&&Number.isFinite(Date.parse(stamp)))row.providerTimestamp=new Date(stamp).toISOString();}
     records.push(row);if(kind!=='event'&&row.uid)uids.add(String(meta.uid));
    }
    const next=body.metadata?.continue;if(next!==undefined&&(typeof next!=='string'||next.length>4096||/[\r\n\0]/.test(next)))throw new ConnectorHttpError('invalid-response');
    continuation=next||undefined;if(!continuation)break;if(page===1)truncated=true;
   }
  }
  return {namespace:this.config.namespace,observedAt:new Date().toISOString(),selector:selector??'',records,truncated};
 }
}
