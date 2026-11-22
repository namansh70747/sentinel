import { ConnectorHttpClient,ConnectorHttpError } from './http';
import { parseSecret } from './config';
export interface DeliveryInput {provider:'ntfy'|'slack';config:Record<string,string>;secret:Record<string,string>;message:string}
export interface DeliveryResult {status:'sent'|'confirmed'|'unknown'|'failed';errorCode?:string;messageId?:string}
export async function deliverNotification(input:DeliveryInput,http=new ConnectorHttpClient({deadlineAt:Date.now()+20000})):Promise<DeliveryResult>{
 let published=false,attempted=false;
 try{
  if(!input.message||input.message.length>10000)return {status:'failed',errorCode:'invalid-message'};
  const secret=parseSecret(input.provider,input.secret);
  const message=Object.values(secret).filter(Boolean).reduce((text,value)=>text.replaceAll(value,'[REDACTED]'),input.message);
  if(input.provider==='slack'){
   if(!secret.webhookUrl)return {status:'failed',errorCode:'credential-required'};
   attempted=true;const response=await http.send(secret.webhookUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:message})});
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
