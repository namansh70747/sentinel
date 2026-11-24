import { ConnectorHttpClient,ConnectorHttpError } from './http';
import { parseSecret } from './config';
import { buildIncidentAdvisory } from './incident-recommendation';
export interface DeliveryInput {provider:'ntfy'|'slack';config:Record<string,string>;secret:Record<string,string>;message:string;incident?:{title:string;service:string;severity:string;status:string;advisory?:{nextStep:string;explanation?:string}|null;evidence?:{source:string;outcome:string;provenance:string|null}[]};testDelivery?:boolean}
export interface DeliveryResult {status:'sent'|'confirmed'|'unknown'|'failed';errorCode?:string;messageId?:string}
export async function deliverNotification(input:DeliveryInput,http=new ConnectorHttpClient({deadlineAt:Date.now()+20000})):Promise<DeliveryResult>{
 let published=false,attempted=false;
 try{
  if(!input.message||input.message.length>10000)return {status:'failed',errorCode:'invalid-message'};
  const secret=parseSecret(input.provider,input.secret);
  const redact=(text:string)=>Object.values(secret).filter(Boolean).reduce((value,credential)=>value.replaceAll(credential,'[REDACTED]'),text);
  const message=redact(input.message);
  if(input.provider==='slack'){
   if(!secret.webhookUrl)return {status:'failed',errorCode:'credential-required'};
   const incident=input.incident;
   const service=incident?redact(incident.service).replace(/[-_]+/g,' ').slice(0,100):'';
   const failed=incident?.status==='failed';
   const needsAttention=incident?.status==='escalated';
   const status=failed?'Check could not finish':needsAttention?'Needs attention':'Check complete';
   const nextStep=incident?(incident.advisory??buildIncidentAdvisory(incident.status,incident.evidence??[])).nextStep:'';
   const priorities:Record<string,string>={sev1:'Critical priority',sev2:'High priority',sev3:'Medium priority',sev4:'Low priority'};
   const priority=incident?priorities[incident.severity.toLowerCase()]:undefined;
   const heading=incident?`${service} · ${status}`:input.testDelivery?'Sentinel delivery test':'Sentinel notification';
   const labels={
    ecs:'AWS service status',
    cloudwatch:'CPU and memory metrics',
    prometheus:'request health',
    loki:'Loki application logs',
    'cloudwatch-logs':'AWS application logs',
    tempo:'request traces',
    github:'recent code changes',
    kubernetes:'cluster status',
    cost:'AWS costs',
    dr:'backup availability',
   };
   const evidence=incident?.evidence??[];
   const sourceNames=(matches:(item:typeof evidence[number])=>boolean)=>Object.entries(labels)
    .filter(([source])=>evidence.some(item=>item.source===source&&matches(item)))
    .map(([,label])=>label).join(', ');
   const passed=sourceNames(item=>item.outcome==='ok'&&item.provenance==='live');
   const missing=sourceNames(item=>item.outcome==='not-configured');
   const empty=sourceNames(item=>item.outcome==='empty'&&item.provenance==='live');
   const remaining=evidence.filter(item=>item.outcome!=='not-configured'&&!(item.provenance==='live'&&['ok','empty'].includes(item.outcome))).length;
   const checks=[
    passed&&`Live checks passed: ${passed}.`,
    empty&&`No records found: ${empty}.`,
    missing&&`Setup needed: ${missing}.`,
    remaining>0&&`Other checks without a live pass: ${remaining}.`,
   ].filter(Boolean).join('\n');
   const detail=incident
    ? [redact(incident.title).slice(0,400),priority,incident.advisory?.explanation].filter(Boolean).join('\n')
    : input.testDelivery?'Slack received the test notification from Sentinel.':message.slice(0,3000);
   const text=[heading,detail,checks,incident?nextStep:''].filter(Boolean).join(' · ').replaceAll('\n',' · ');
   const blocks:object[]=[
    {type:'header',text:{type:'plain_text',text:heading}},
    {type:'section',text:{type:'plain_text',text:detail}},
   ];
   const findings=[];
   if(passed) findings.push({type:'section',text:{type:'mrkdwn',text:`*What Sentinel verified*\n${passed}`}});
   if(empty) findings.push({type:'section',text:{type:'mrkdwn',text:`*No records found*\n${empty}`}});
   if(missing) findings.push({type:'section',text:{type:'mrkdwn',text:`*Setup needed*\n${missing}`}});
   if(remaining>0) findings.push({type:'context',elements:[{type:'plain_text',text:`Other checks without a live pass: ${remaining}.`} ]});
   if(incident) blocks.push({type:'section',text:{type:'mrkdwn',text:`*What to do next*\n${nextStep}`}});
   const color=failed||incident?.severity==='sev1'?'#B91C1C':needsAttention?'#B45309':'#2563EB';
   const attachments=findings.length?[{color,blocks:findings}]:undefined;
   const payload={text,blocks,attachments,mrkdwn:false,unfurl_links:false,unfurl_media:false};
   attempted=true;const response=await http.send(secret.webhookUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   return response.text.trim()==='ok'?{status:'sent'}:{status:'unknown',errorCode:'unexpected-provider-acknowledgement'};
  }
  if(!secret.token)return {status:'failed',errorCode:'credential-required'};
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(input.config.topic))return {status:'failed',errorCode:'invalid-topic'};
  const endpoint=String(input.config.endpoint).replace(/\/$/,'')+'/'+input.config.topic,headers={authorization:`Bearer ${secret.token}`};
  attempted=true;const response=await http.send(endpoint,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:message});
  const body=JSON.parse(response.text) as {id?:unknown};
  if(typeof body.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(body.id))return {status:'unknown',errorCode:'invalid-provider-acknowledgement'};
  const messageId=body.id;
  if(Object.values(secret).some(value=>value&&messageId.includes(value)))return {status:'unknown',errorCode:'invalid-provider-acknowledgement'};
  published=true;
  // A 2xx response proves acceptance. Polling the authenticated subscription
  // independently confirms that this exact message reached its approved topic.
  for(let attempt=0;attempt<3;attempt++){
   try{
    const subscription=await http.get(endpoint+'/json?poll=1&since=10s',headers);
    const events=subscription.text.split('\n').filter(Boolean).map(line=>JSON.parse(line) as {id?:unknown;event?:unknown;message?:unknown});
    if(events.some(event=>event.id===messageId&&event.event==='message'&&event.message===message))return {status:'confirmed',messageId};
   }catch{return {status:'sent',messageId,errorCode:'receipt-unverified'};}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  return {status:'sent',messageId,errorCode:'receipt-unverified'};
 }catch(error){
  if(!attempted)return {status:'failed',errorCode:'invalid-configuration'};
  if(published)return {status:'sent',errorCode:'receipt-unverified'};
  if(error instanceof ConnectorHttpError){
   const definitive=error.code==='endpoint-rejected'||error.status!==undefined&&error.status>=400&&error.status<500;
   return {status:definitive?'failed':'unknown',errorCode:error.code};
  }
  return {status:'unknown',errorCode:'provider-result-uncertain'};
 }
}
