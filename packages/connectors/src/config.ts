export const providers=['prometheus','loki','tempo','grafana','github','ntfy','slack'] as const;
export type Provider=typeof providers[number];
export interface ConnectorDraft { provider:Provider; name:string; mode:'live'|'off'; config:Record<string,string|number> }
function object(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('Invalid configuration fields');
 return value as Record<string,unknown>;
}
function text(value:unknown,max=16384):string {
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\r\n\0]/.test(value))throw new Error('Invalid configuration value');
 return value.trim();
}
export function parseConnector(value:unknown):ConnectorDraft {
 const row=object(value,['provider','name','mode','config']);
 if(!providers.includes(row.provider as Provider)||!['live','off'].includes(row.mode as string))throw new Error('Unsupported provider or mode');
 const provider=row.provider as Provider;
 const config=object(row.config,provider==='github'||provider==='slack'?[]:provider==='ntfy'?['endpoint','topic']:['endpoint','tenantId']);
 const parsed:Record<string,string|number>={};
 if(!['github','slack'].includes(provider)){
  const url=new URL(text(config.endpoint,2048));
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid provider endpoint');
  parsed.endpoint=url.href.replace(/\/$/,'');
 }
 if(config.tenantId!==undefined)parsed.tenantId=text(config.tenantId,128);
 if(provider==='ntfy'){const topic=text(config.topic,128);if(!/^[A-Za-z0-9_-]{16,128}$/.test(topic))throw new Error('Invalid ntfy topic');parsed.topic=topic;}
 return {provider,name:text(row.name,160),mode:row.mode as 'live'|'off',config:parsed};
}
export function parseBinding(provider:Provider,value:unknown):Record<string,string|number>{
 const keys:Record<Provider,string[]>={prometheus:['goodQuery','totalQuery','latencyQuery','goodCoverageQuery','totalCoverageQuery','latencyCoverageQuery','scrapeIntervalSeconds'],loki:['query'],tempo:['serviceName'],github:['owner','repo'],grafana:['endpointId'],ntfy:[],slack:[]};
 const row=object(value,keys[provider]);const result:Record<string,string|number>={};
 for(const key of keys[provider]){
  if(key==='scrapeIntervalSeconds'){const interval=row[key]??15;if(!Number.isInteger(interval)||Number(interval)<1||Number(interval)>300)throw new Error('Invalid scrape interval');result[key]=Number(interval);}
  else result[key]=text(row[key]);
 }
 if(provider==='prometheus'&&(!String(result.goodQuery).includes('{window}')||!String(result.totalQuery).includes('{window}')))throw new Error('Request queries require {window}');
 if(provider==='github'&&(!/^[a-z\d][a-z\d-]{0,38}$/i.test(String(result.owner))||!/^[-.\w]{1,100}$/.test(String(result.repo))||['.','..'].includes(String(result.repo))))throw new Error('Invalid repository mapping');
 if(provider==='loki'&&!String(result.query).startsWith('{'))throw new Error('Log query requires explicit stream labels');
 return result;
}
export function parseSecret(provider:Provider,value:unknown):Record<string,string>{
 const row=object(value,provider==='slack'?['webhookUrl']:['token']);
 const result:Record<string,string>={};
 for(const [key,value]of Object.entries(row)){if(typeof value!=='string'||value.length>8192||/[\r\n\0]/.test(value))throw new Error('Invalid connector secret');if(value)result[key]=value;}
 if(result.webhookUrl){const url=new URL(result.webhookUrl);if(url.protocol!=='https:'||url.hostname!=='hooks.slack.com'||!url.pathname.startsWith('/services/')||url.username||url.password||url.hash||url.search)throw new Error('Invalid Slack webhook');}
 return result;
}
