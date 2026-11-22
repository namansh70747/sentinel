import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export class ConnectorHttpError extends Error {
 constructor(public readonly code:'endpoint-rejected'|'redirect-rejected'|'response-too-large'|'denied'|'unavailable'|'rate-limited'|'invalid-response',public readonly status?:number,public readonly retryAfterMs?:number){super(`Connector request ${code}`);}
}
interface Address {address:string;family:number}
interface Options {allowedPrivateOrigins?:string[];maxResponseBytes?:number;timeoutMs?:number;resolve?:(hostname:string)=>Promise<Address[]>}
export interface HttpResult {status:number;headers:IncomingHttpHeaders;text:string}
const privateNetworks=new BlockList(),forbiddenNetworks=new BlockList();
for(const [address,prefix]of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['224.0.0.0',4]] as const)privateNetworks.addSubnet(address,prefix,'ipv4');
for(const [address,prefix]of [['::',128],['::1',128],['fc00::',7]] as const)privateNetworks.addSubnet(address,prefix,'ipv6');
forbiddenNetworks.addSubnet('169.254.0.0',16,'ipv4');forbiddenNetworks.addSubnet('fe80::',10,'ipv6');
export function localConnectorOrigins(){return (process.env.SENTINEL_CONNECTOR_ALLOWED_ORIGINS??'http://prometheus:9090,http://loki:3100,http://tempo:3200,http://grafana:3000,http://ntfy:80,http://127.0.0.1:9090,http://127.0.0.1:3100,http://127.0.0.1:3200,http://127.0.0.1:3012,http://127.0.0.1:8091').split(',').map(value=>value.trim()).filter(Boolean);}
export class ConnectorHttpClient {
 private readonly origins:Set<string>;private readonly limit:number;private readonly timeout:number;
 constructor(private readonly options:Options={}){
  this.origins=new Set(options.allowedPrivateOrigins??localConnectorOrigins());
  this.limit=options.maxResponseBytes??2*1024*1024;this.timeout=options.timeoutMs??10000;
  if(!Number.isInteger(this.limit)||this.limit<1||this.limit>2*1024*1024||!Number.isInteger(this.timeout)||this.timeout<1||this.timeout>30000)throw new Error('Invalid connector request bounds');
 }
 private async endpoint(raw:string){
  let url:URL;try{url=new URL(raw);}catch{throw new ConnectorHttpError('endpoint-rejected');}
  const approved=this.origins.has(url.origin);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||(url.protocol==='http:'&&!approved))throw new ConnectorHttpError('endpoint-rejected');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  let addresses:Address[];
  try{addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await(this.options.resolve??(name=>lookup(name,{all:true})))(hostname);}catch{throw new ConnectorHttpError('unavailable');}
  if(!addresses.length||addresses.length>16||addresses.some(({address,family})=>!isIP(address)||forbiddenNetworks.check(address,family===6?'ipv6':'ipv4')||(!approved&&privateNetworks.check(address,family===6?'ipv6':'ipv4'))))throw new ConnectorHttpError('endpoint-rejected');
  return {url,addresses};
 }
 private async once(raw:string,options:{method?:'GET'|'POST';headers?:Record<string,string>;body?:string},timeout:number):Promise<HttpResult>{
  const started=Date.now();let timer:ReturnType<typeof setTimeout>|undefined;
  const {url,addresses}=await Promise.race([
   this.endpoint(raw),
   new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new ConnectorHttpError('unavailable')),timeout);}),
  ]).finally(()=>{if(timer)clearTimeout(timer);});
  const remaining=timeout-(Date.now()-started);
  if(remaining<=0)throw new ConnectorHttpError('unavailable');
  return new Promise((resolve,reject)=>{
   const request=url.protocol==='https:'?httpsRequest:httpRequest;
   const req=request(url,{method:options.method??'GET',headers:options.headers,agent:false,signal:AbortSignal.timeout(remaining),lookup:(_hostname,_options,callback)=>{
    const opts=_options as {all?:boolean};
    if(opts.all)(callback as unknown as (error:null,addresses:Address[])=>void)(null,addresses);
    else callback(null,addresses[0].address,addresses[0].family);
   }},response=>{
    const status=response.statusCode??0;
    if(status>=300&&status<400){response.destroy();reject(new ConnectorHttpError('redirect-rejected',status));return;}
    if(status<200||status>=300){
     const rawRetry=response.headers['retry-after'];let retryAfterMs:number|undefined;
     if(typeof rawRetry==='string'){const seconds=Number(rawRetry);retryAfterMs=Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(rawRetry)-Date.now());if(!Number.isFinite(retryAfterMs))retryAfterMs=undefined;}
     response.destroy();reject(new ConnectorHttpError(status===401||status===403?'denied':status===429?'rate-limited':'unavailable',status,retryAfterMs));return;
    }
    if(Number(response.headers['content-length']??0)>this.limit){response.destroy();reject(new ConnectorHttpError('response-too-large'));return;}
    const chunks:Buffer[]=[];let size=0;
    response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>this.limit){response.destroy();reject(new ConnectorHttpError('response-too-large'));}else chunks.push(chunk);});
    response.on('end',()=>resolve({status,headers:response.headers,text:Buffer.concat(chunks).toString('utf8')}));
    response.on('error',()=>reject(new ConnectorHttpError('unavailable')));
   });
   req.on('error',()=>reject(new ConnectorHttpError('unavailable')));
   if(options.body)req.write(options.body);req.end();
  });
 }
 async send(url:string,options:{method?:'GET'|'POST';headers?:Record<string,string>;body?:string}={}):Promise<HttpResult>{
  const deadline=Date.now()+30000;
  for(let attempt=0;;attempt++){
   try{return await this.once(url,options,Math.max(1,Math.min(this.timeout,deadline-Date.now())));}
   catch(error){
    if(!(error instanceof ConnectorHttpError)||options.method==='POST'||attempt>=2||!['unavailable','rate-limited'].includes(error.code)||(error.status!==undefined&&error.status<500&&error.status!==429))throw error;
    const delay=error.retryAfterMs??250*2**attempt;
    if(Date.now()+delay>=deadline)throw error;
    await new Promise(resolve=>setTimeout(resolve,delay));
   }
  }
 }
 get(url:string,headers?:Record<string,string>){return this.send(url,{headers});}
 async json(url:string,headers?:Record<string,string>):Promise<unknown>{
  const result=await this.get(url,headers);
  try{return JSON.parse(result.text);}catch{throw new ConnectorHttpError('invalid-response');}
 }
}
