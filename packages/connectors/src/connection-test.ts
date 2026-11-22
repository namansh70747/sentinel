import { ConnectorHttpClient,ConnectorHttpError } from './http';
import type { Provider } from './config';
interface TestInput {provider:Provider;mode:string;config:Record<string,string|number>;secret:Record<string,string>}
export interface CapabilityResult {outcome:'verified-read'|'reachable'|'empty'|'not-configured'|'unavailable'|'denied'|'unsupported';capability:string;recordCount:number;errorCode?:string}
export async function testConnection(input:TestInput,http=new ConnectorHttpClient()):Promise<CapabilityResult>{
 const result=(outcome:CapabilityResult['outcome'],capability:string,recordCount=0,errorCode?:string)=>({outcome,capability,recordCount,...(errorCode?{errorCode}:{})});
 if(input.mode!=='live')return result('not-configured','connection-test',0,'connector-disabled');
 const headers:Record<string,string>={};if(input.secret.token)headers.authorization=`Bearer ${input.secret.token}`;
 if(input.config.tenantId)headers['X-Scope-OrgID']=String(input.config.tenantId);
 const base=String(input.config.endpoint??'').replace(/\/$/,'');
 try{
  if(input.provider==='slack')return result('unsupported','webhook.delivery',0,'approved-publication-required');
  if(input.provider==='github'){
   if(!input.secret.token)return result('not-configured','identity.read',0,'credential-required');
   const body=await http.json('https://api.github.com/user',{...headers,accept:'application/vnd.github+json','user-agent':'Sentinel'}) as {id?:unknown};
   if(!Number.isSafeInteger(body.id))throw new ConnectorHttpError('invalid-response');
   return result('verified-read','identity.read',1);
  }
  if(input.provider==='prometheus'){
   const url=new URL(base+'/api/v1/query');url.searchParams.set('query','up');
   const body=await http.json(url.href,headers) as {status?:string;data?:{result?:unknown[]}};
   if(body.status!=='success'||!Array.isArray(body.data?.result))throw new ConnectorHttpError('invalid-response');
   return result(body.data.result.length?'verified-read':'empty','metrics.query',body.data.result.length);
  }
  if(input.provider==='loki'){
   const body=await http.json(base+'/loki/api/v1/labels',headers) as {status?:string;data?:unknown[]};
   if(body.status!=='success'||!Array.isArray(body.data))throw new ConnectorHttpError('invalid-response');
   return result(body.data.length?'verified-read':'empty','logs.labels',body.data.length);
  }
  if(input.provider==='tempo'){
   const body=await http.json(base+'/api/search?limit=5',headers) as {traces?:unknown[]};
   if(!Array.isArray(body.traces))throw new ConnectorHttpError('invalid-response');
   return result(body.traces.length?'verified-read':'empty','traces.search',body.traces.length);
  }
  if(input.provider==='grafana'){
   if(!input.secret.token){await http.json(base+'/api/health');return result('reachable','health');}
   const body=await http.json(base+'/api/datasources',headers);if(!Array.isArray(body))throw new ConnectorHttpError('invalid-response');return result(body.length?'verified-read':'empty','datasources.read',body.length);
  }
  const health=await http.json(base+'/v1/health',headers) as {healthy?:boolean};
  if(health.healthy!==true)throw new ConnectorHttpError('invalid-response');
  return result('reachable','notifications.health');
 }catch(error){return result(error instanceof ConnectorHttpError&&error.code==='denied'?'denied':'unavailable','connection-test',0,error instanceof ConnectorHttpError?error.code:'invalid-response');}
}
