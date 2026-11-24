export interface RecommendationEvidence {
 source: string;
 outcome: string;
 provenance: string | null;
 attempt_id?: string;
 severity?: string;
}

const checks = {
 prometheus: ['request monitoring', 'request health'],
 ecs: ['AWS service access', 'AWS service status'],
 cloudwatch: ['CloudWatch metrics', 'CPU and memory metrics'],
 loki: ['application logs', 'Loki application logs'],
 'cloudwatch-logs':['AWS log monitoring','AWS application logs'],
 tempo: ['request tracing', 'request traces'],
 kubernetes: ['cluster monitoring', 'cluster status'],
 github: ['repository access', 'recent code changes'],
 dr: ['backup visibility', 'backup availability'],
 cost: ['AWS cost reporting', 'AWS costs'],
} as const;

type RankChecks = (candidates: readonly RecommendationEvidence[]) => Promise<string>;

function prioritizedChecks(evidence:readonly RecommendationEvidence[]) {
 const ordered=Object.keys(checks).flatMap(source=>evidence.filter(item=>item.source===source&&item.provenance!=='simulated'));
 const breach=ordered.find(item=>item.source==='prometheus'&&item.provenance==='live'&&['ok','uncovered'].includes(item.outcome)&&['sev1','sev2','sev3'].includes(item.severity??''));
 if(breach)return [breach];
 const missingRequired=ordered.find(item=>item.source==='prometheus'&&item.outcome==='not-configured');
 if(missingRequired)return [missingRequired];
 const unresolved=ordered.filter(item=>!['ok','not-configured'].includes(item.outcome));
 return unresolved.length?unresolved:ordered.filter(item=>item.outcome==='not-configured');
}

export function buildIncidentAdvisory(status:string,evidence:readonly RecommendationEvidence[],choice?:string) {
 const candidates=prioritizedChecks(evidence);
 const selected=candidates.find(item=>item.source===choice)??candidates[0];
 let action='review-investigation', nextStep='Review the findings in Sentinel before closing the incident.';
 if(status==='failed'){
  action='rerun-investigation';
  nextStep='Ask the support team to review why the check stopped, then run it again.';
 }else if(selected){
  const [setup,label]=checks[selected.source as keyof typeof checks];
  action=selected.outcome+':'+selected.source;
  if(selected.source==='prometheus'&&['sev1','sev2','sev3'].includes(selected.severity??'')&&['ok','uncovered'].includes(selected.outcome)){
   action='review-slo-breach';
   nextStep='Review the affected requests and recent changes, then confirm recovery against the service target.';
  }else if(selected.outcome==='not-configured'){
   action='setup:'+selected.source;
   nextStep=`Connect ${setup} for this service, then run the check again.`;
  }else if(selected.outcome==='denied')nextStep=`Ask the provider owner to verify read access for ${label}, then run the check again.`;
  else if(['uncovered','empty','stale'].includes(selected.outcome))nextStep=`Check whether this service has enough recent data for ${label}, then run the check again.`;
  else nextStep=`Ask the support team to check ${label} in the provider dashboard and confirm what is happening.`;
 }
 const reference=status!=='failed'&&selected?.attempt_id;
 return {policyVersion:1,mode:'rules' as const,actionIds:[action],evidenceRefs:reference?[reference]:[],nextStep,createdAt:new Date().toISOString()};
}

export function comparableAdvisoryChecks(evidence:readonly RecommendationEvidence[]) {
 const candidates=prioritizedChecks(evidence);
 const comparable=candidates.filter(item=>item.outcome===candidates[0]?.outcome&&
  ['unavailable','stale','uncovered','empty','denied'].includes(item.outcome)&&
  ['prometheus','ecs','cloudwatch','loki','tempo','kubernetes'].includes(item.source));
 return comparable.includes(candidates[0])?comparable:[];
}

export function modelAdvisoryCandidates(evidence:readonly RecommendationEvidence[]) {
 const comparable=comparableAdvisoryChecks(evidence);
 return comparable.length?comparable.slice(0,6):prioritizedChecks(evidence).slice(0,1);
}

export function finalizeModelAdvisory(status:string,evidence:readonly RecommendationEvidence[],choice:string,provider:string) {
 const selected=modelAdvisoryCandidates(evidence).find(item=>item.source===choice);
 if(status==='failed'||!selected?.attempt_id)return null;
 const [,label]=checks[selected.source as keyof typeof checks];
 const description=selected.source==='prometheus'?'Request health monitoring':label;
 const explanation=selected.outcome==='not-configured'?`${description} is not connected for this service.`
  :selected.outcome==='denied'?`The provider denied read access for ${label}.`
  :selected.outcome==='ok'?'The live request check recorded a service target breach.'
  :`The investigation could not verify ${label} from current provider data.`;
 return {...buildIncidentAdvisory(status,evidence,choice), mode:'model-assisted' as const,provider,explanation};
}

export type ModelIncidentAdvisory = NonNullable<ReturnType<typeof finalizeModelAdvisory>>;

export async function recommendIncidentStep(status:string,evidence:readonly RecommendationEvidence[],rank?:RankChecks) {
 const comparable=comparableAdvisoryChecks(evidence);
 const choice=status!=='failed'&&rank&&comparable.length>1?await rank(comparable).catch(()=>undefined):undefined;
 return buildIncidentAdvisory(status,evidence,comparable.some(item=>item.source===choice)?choice:undefined).nextStep;
}

export async function rankWithLocalOllama(candidates: readonly RecommendationEvidence[]): Promise<string> {
 const { SENTINEL_RECOMMENDATION_OLLAMA_URL: origin, OLLAMA_MODEL: model }=process.env;
 if(!origin||!model)return '';
 const url=new URL(origin);
 if(!['http://127.0.0.1:11434','http://ollama:11434'].includes(url.origin)||
    url.username||url.password)return '';
 const response=await fetch(new URL('/api/generate',url),{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  redirect:'error',
  signal:AbortSignal.timeout(8000),
  body:JSON.stringify({
   model,
   stream:false,
   prompt:`Pick the one telemetry source an operator should check first. Candidates are ${JSON.stringify(candidates.map(({source,outcome})=>({source,outcome})))}. Return a JSON object containing the chosen source.`,
   format:{type:'object',properties:{source:{type:'string',enum:candidates.map(item=>item.source)}},required:['source'],additionalProperties:false},
   options:{temperature:0,num_predict:32},
  }),
 });
 if(!response.ok)return '';
 const result=await response.json() as {response?:unknown};
 if(typeof result.response!=='string')return '';
 try{const parsed=JSON.parse(result.response) as {source?:unknown};
  return typeof parsed.source==='string'?parsed.source:'';
 }catch{return '';}
}

export function bedrockAdvisoryConfig(workspaceId:string) {
 const {SENTINEL_BEDROCK_ADVISORY_WORKSPACES, SENTINEL_BEDROCK_ADVISORY_ROLE_ARN:roleArn,
  SENTINEL_READ_ROLE_ARN, BEDROCK_REGION:region, BEDROCK_RANK_MODEL_ID:model}=process.env;
 if(!SENTINEL_BEDROCK_ADVISORY_WORKSPACES?.split(',').map(x=>x.trim()).includes(workspaceId)||
    !roleArn||roleArn===SENTINEL_READ_ROLE_ARN||!region||!model)return null;
 return {roleArn,region,model};
}

export async function rankWithBedrock(
 config:NonNullable<ReturnType<typeof bedrockAdvisoryConfig>>,
 candidates:readonly RecommendationEvidence[],
) {
 const {BedrockRuntimeClient,ConverseCommand}=await import('@aws-sdk/client-bedrock-runtime');
 const {fromTemporaryCredentials}=await import('@aws-sdk/credential-providers');
 const client=new BedrockRuntimeClient({region:config.region,maxAttempts:1,credentials:fromTemporaryCredentials({
  clientConfig:{region:config.region},
  params:{RoleArn:config.roleArn,RoleSessionName:'sentinel-advisory',DurationSeconds:900},
 })});
 try{
  const choices=candidates.map(({source,outcome})=>({source,outcome}));
  const result=await client.send(new ConverseCommand({
   modelId:config.model,
   system:[{text:'Select the first telemetry check an operator should investigate. Return exactly one source ID from the supplied choices.'}],
   messages:[{role:'user',content:[{text:JSON.stringify(choices)}]}],
   inferenceConfig:{temperature:0,maxTokens:16},
  }),{abortSignal:AbortSignal.timeout(8000)});
  const choice=result.output?.message?.content?.find(item=>typeof item.text==='string')?.text?.trim()??'';
  return {choice,inputTokens:result.usage?.inputTokens,outputTokens:result.usage?.outputTokens};
 }finally{client.destroy();}
}

export function hostedAdvisoryKeys() {
 return {gemini:process.env.GEMINI_API_KEY?.trim(),nvidia:process.env.NVIDIA_API_KEY?.trim()};
}

async function boundedModelJson(response:Response):Promise<unknown> {
 const reader=response.body?.getReader();
 if(!reader)return null;
 const decoder=new TextDecoder();
 let size=0,body='';
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)return JSON.parse(body+decoder.decode());
   size+=value.byteLength;
   if(size>32768){await reader.cancel();return null;}
   body+=decoder.decode(value,{stream:true});
  }
 }finally{reader.releaseLock();}
}

export async function rankWithHostedProviders(
 candidates:readonly RecommendationEvidence[],
 keys:{gemini?:string;nvidia?:string},
 request:typeof fetch=fetch,
) {
 if(!keys.gemini&&!keys.nvidia)return null;
 const outcomes=new Set(['ok','unavailable','stale','not-configured','uncovered','empty','denied']);
 const approved=new Map<string,string>();
 for(const {source,outcome,provenance} of candidates){
  if((provenance==='live'||provenance===null)&&Object.hasOwn(checks,source)&&outcomes.has(outcome)&&!approved.has(source)){
   approved.set(source,outcome);
  }
  if(approved.size===6)break;
 }
 if(!approved.size)return null;
 const ids=[...approved.keys()];
 const prompt='Select the first check from these approved alternatives. Return only a JSON object with a source field. '+JSON.stringify([...approved].map(([source,outcome])=>({source,outcome})));
 const configs=[
  {provider:'gemini',key:keys.gemini,model:'gemini-3.5-flash-lite',url:'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'},
  {provider:'nvidia',key:keys.nvidia,model:'nvidia/nemotron-3.5-bolt-e4b',url:'https://integrate.api.nvidia.com/v1/chat/completions'},
 ] as const;
 const started=performance.now();
 let attempts=0;
 let last=null as {provider:string;model:string;choice:string|null;status:'accepted'|'invalid'|'unavailable';attempts:number;httpStatus?:number}|null;
 for(const config of configs){
  if(!config.key)continue;
  const remaining=Math.floor(8000-(performance.now()-started));
  if(remaining<=0)break;
  const primary=config.provider==='gemini';
  const timeout=primary&&keys.nvidia?Math.min(4000,remaining):remaining;
  const state:NonNullable<typeof last>={provider:config.provider,model:config.model,choice:null,status:'unavailable',attempts:++attempts};
  last=state;
  try{
   const headers:Record<string,string>={'content-type':'application/json'};
   if(primary)headers['x-goog-api-key']=config.key;
   else headers.authorization='Bearer '+config.key;
   const body=primary?{
    contents:[{parts:[{text:prompt}]}],
    generationConfig:{temperature:0,maxOutputTokens:128,thinkingConfig:{thinkingLevel:'MINIMAL'},responseMimeType:'application/json',
     responseSchema:{type:'OBJECT',properties:{source:{type:'STRING',enum:ids}},required:['source']}},
   }:{
    model:config.model,messages:[{role:'user',content:prompt}],stream:false,max_tokens:128,temperature:0,
   };
   const response=await request(config.url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(timeout)});
   state.httpStatus=response.status;
   if(!response.ok){await response.body?.cancel();continue;}
   state.status='invalid';
   const payload=await boundedModelJson(response) as {candidates?:{content?:{parts?:{text?:string;thought?:boolean}[]}}[];choices?:{message?:{content?:string}}[]}|null;
   const content=primary?payload?.candidates?.[0]?.content?.parts?.find(part=>!part.thought&&typeof part.text==='string')?.text:payload?.choices?.[0]?.message?.content;
   const parsed=JSON.parse(content??'null') as {source?:unknown}|null;
   if(typeof parsed?.source==='string'&&Object.keys(parsed).length===1&&approved.has(parsed.source)){
    return {...state,status:'accepted' as const,choice:parsed.source};
   }
  }catch{/* Preserve a bounded status only. Provider bodies and credentials stay private. */}
 }
 return last;
}
