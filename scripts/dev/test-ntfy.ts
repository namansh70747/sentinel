import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ConnectorHttpClient } from '@sentinel/connectors/http';
const configuration=JSON.parse(await readFile('.local/ntfy/connection.json','utf8'));
if(!/^[A-Za-z0-9_-]{16,128}$/.test(configuration.topic))throw new Error('Invalid local test topic');
const token=(await readFile('.local/ntfy/token','utf8')).trim(),endpoint=`http://127.0.0.1:8091/${configuration.topic}`;
const deadline=Date.now()+20000,http=new ConnectorHttpClient({deadlineAt:deadline});
const headers={authorization:`Bearer ${token}`},message=`Sentinel local receipt proof ${randomUUID()}`;
const response=await http.send(endpoint,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:message});
const published=JSON.parse(response.text) as {id?:string};
if(!published.id||!/^[A-Za-z0-9_-]{1,100}$/.test(published.id))throw new Error('Local publishing returned no valid message identifier');
let received=false;
while(Date.now()<deadline){
 const subscription=await http.get(endpoint+'/json?poll=1&since=10s',headers);
 const events=subscription.text.split('\n').filter(Boolean).map(line=>JSON.parse(line) as {id?:string;event?:string;message?:string});
 received=events.some(event=>event.id===published.id&&event.event==='message'&&event.message===message);
 if(received)break;await new Promise(resolve=>setTimeout(resolve,250));
}
if(!received)throw new Error('Published local ntfy message was not observed through the authenticated subscription');
console.log('Actual local ntfy publish and authenticated subscription receipt verified. Product delivery ledger remains a separate acceptance gate.');
