'use client';
import { useEffect,useState } from 'react';
interface Workspace {workspace_id:string;name:string;role:string}
interface Connection {id:string;name:string;provider:string;mode:string;configVersion:number;hasSecret:boolean;config:{endpoint?:string;topic?:string}}
interface Subscription {id:string;destination_label:string;enabled:boolean;config_version:number;current_version:number;provider:string;mode:string}
interface Delivery {id:string;destination_label:string;provider:string;status:string;created_at:string;error_code:string|null}
export function NotificationManager(){
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[workspace,setWorkspace]=useState(''),[connections,setConnections]=useState<Connection[]>([]),[services,setServices]=useState<{id:string;name:string}[]>([]);
 const [subscriptions,setSubscriptions]=useState<Subscription[]>([]),[deliveries,setDeliveries]=useState<Delivery[]>([]),[choice,setChoice]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const role=workspaces.find(row=>row.workspace_id===workspace)?.role,admin=role==='admin',canSend=admin||role==='responder';
 async function request(path:string,options?:RequestInit){const response=await fetch(path,{cache:'no-store',...options}),body=await response.json();if(!response.ok)throw new Error(body.error??'Notification request failed');return body;}
 useEffect(()=>{let active=true;request('/api/workspaces').then((rows:Workspace[])=>{if(active){setWorkspaces(rows);let saved='';try{saved=localStorage.getItem('sentinel-active-workspace')??'';}catch{}setWorkspace(rows.find(row=>row.workspace_id===saved)?.workspace_id??rows[0]?.workspace_id??'');setLoading(false);}}).catch(error=>{if(active){setMessage(error.message);setLoading(false);}});return()=>{active=false;};},[]);
 const base=`/api/workspaces/${workspace}`;
 useEffect(()=>{
  if(!workspace)return;let active=true;setLoading(true);setConnections([]);setServices([]);setSubscriptions([]);setDeliveries([]);setChoice('');setApproved(false);setMessage('');
  const load=async()=>{try{const [connectors,catalog,targets,history]=await Promise.all([request(base+'/connectors'),request(base+'/services'),request(base+'/notification-subscriptions'),request(base+'/notification-deliveries')]);if(active){setConnections(connectors.filter((row:Connection)=>['ntfy','slack'].includes(row.provider)));setServices(catalog);setSubscriptions(targets);setDeliveries(history);}}catch(error){if(active)setMessage(error instanceof Error?error.message:'Unable to load notifications');}finally{if(active)setLoading(false);}};
  void load();const timer=setInterval(load,3000);return()=>{active=false;clearInterval(timer);};
 },[base,workspace]);
 async function approve(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);const form=new FormData(event.currentTarget),[connectorId,version]=choice.split(':');
  try{await request(base+'/notification-subscriptions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serviceId:form.get('serviceId'),connectorId,expectedVersion:Number(version),destinationLabel:form.get('destinationLabel'),approvedTestDestination:approved})});setApproved(false);setMessage('Destination approved for this configuration version. Select Test delivery to send a verification message.');}
  catch(error){setMessage(error instanceof Error?error.message:'Unable to approve destination');}finally{setBusy(false);}
 }
 async function act(subscription:Subscription,disable=false){setBusy(true);try{await request(base+`/notification-subscriptions/${subscription.id}`+(disable?'':'/tests'),disable?{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:false})}:{method:'POST'});setMessage(disable?'Subscription disabled.':'Delivery queued. A lost response stays unknown and is never blindly retried.');}catch(error){setMessage(error instanceof Error?error.message:'Unable to request delivery');}finally{setBusy(false);}}
 const selected=connections.find(row=>`${row.id}:${row.configVersion}`===choice);
 return <section><div className="sc-heading"><div><div className="sc-eyebrow">APPROVED DESTINATIONS</div><h1>Notifications with a delivery record.</h1><p>Publishing intent, provider acknowledgement and observed receipt stay distinct.</p></div></div>
  <section className="sc-card sc-detail-pad"><label>Active workspace<select value={workspace} onChange={event=>setWorkspace(event.target.value)}>{workspaces.map(row=><option value={row.workspace_id} key={row.workspace_id}>{row.name}</option>)}</select></label><p role="status">{message}</p></section>
  {admin&&<form className="sc-card sc-detail-pad" key={workspace} onSubmit={approve}><h2>Approve a test destination</h2><p>Configure a private ntfy token or Slack webhook in Connectors first. Changing that connection invalidates this approval.</p>
   <label>Service<select name="serviceId" required>{services.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label>Communication connection<select required value={choice} onChange={event=>{setChoice(event.target.value);setApproved(false);}}><option value="">Select a configured destination</option>{connections.filter(row=>row.mode==='live'&&row.hasSecret).map(row=><option key={`${row.id}:${row.configVersion}`} value={`${row.id}:${row.configVersion}`}>{row.name} · {row.provider} · v{row.configVersion}</option>)}</select></label>
   {selected&&<p>{selected.provider==='ntfy'?`${selected.config.endpoint}/${selected.config.topic}`:'The channel bound to the stored Slack incoming webhook.'}</p>}
   <label>Destination label<input name="destinationLabel" required maxLength={160} placeholder="Local test topic / approved test channel"/></label>
   <label><input type="checkbox" required checked={approved} onChange={event=>setApproved(event.target.checked)}/>I approve this exact topic or webhook destination for test messages and this service’s incident updates.</label>
   <button className="sc-button sc-primary" disabled={busy||!approved||!selected||!services.length}>Approve destination</button>
  </form>}
  <h2>Subscriptions</h2>{loading?<p role="status">Loading destinations…</p>:!subscriptions.length?<p>No approved destinations. No messages will be published.</p>:<div className="sc-connector-grid">{subscriptions.map(row=>{const valid=row.enabled&&row.mode==='live'&&row.config_version===row.current_version;return <article className="sc-card sc-detail-pad" key={row.id}><h3>{row.destination_label}</h3><p>{row.provider} · configuration v{row.config_version} · {valid?'Approved':row.enabled?'Approval invalidated':'Disabled'}</p>{canSend&&<button className="sc-button sc-secondary" disabled={busy||!valid} onClick={()=>act(row)}>Test delivery</button>}{admin&&row.enabled&&<button className="sc-button sc-secondary" disabled={busy} onClick={()=>act(row,true)}>Disable</button>}</article>;})}</div>}
  <h2>Delivery history</h2><p>Confirmed means an ntfy subscription observed the exact message. Sent means the provider acknowledged it. Unknown requires operator review.</p>
  {!deliveries.length?<p>No deliveries recorded.</p>:<div style={{overflowX:'auto'}}><table className="sc-table"><thead><tr><th>Created</th><th>Destination</th><th>Provider</th><th>Status</th><th>Diagnostic</th></tr></thead><tbody>{deliveries.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.destination_label}</td><td>{row.provider}</td><td>{row.status}</td><td>{row.error_code??'—'}</td></tr>)}</tbody></table></div>}
 </section>;
}
