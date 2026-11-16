'use client';
import { GrafanaWebhook } from './grafana-webhook';
import { PasskeySettings } from './passkey-settings';
import { WorkspaceAudit } from './workspace-audit';
import { Investigations } from './investigations';
import { SloSetup } from './slo-setup';
import { useEffect, useState, type FormEvent } from 'react';
type Workspace = {workspace_id:string;name:string;role:string};
type Service = {id:string;name:string;owner:string;region:string;act:boolean};
export function WorkspaceSetup({ section = 'overview' }: { section?: 'overview' | 'incidents' | 'audit' | 'services' }) {
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[selected,setSelected]=useState(''),[services,setServices]=useState<Service[]>([]);
 const [message,setMessage]=useState('Loading workspaces…'),[busy,setBusy]=useState(false);
 useEffect(()=> { let cancelled=false; fetch('/api/workspaces').then(async response=> {if(!response.ok) throw new Error('Unable to load workspaces');return response.json();}).then((rows:Workspace[])=>{if(!cancelled){setWorkspaces(rows);setSelected(rows[0]?.workspace_id??'');setMessage(rows.length?'':'Create your first workspace.');}}).catch(error=>{if(!cancelled)setMessage(error.message);});return()=>{cancelled=true;};},[]);
 useEffect(()=>{if(!selected)return;const controller=new AbortController();setServices([]);fetch(`/api/workspaces/${selected}/services`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Unable to load services');return response.json();}).then(rows=>{setServices(rows);setMessage('');}).catch(error=>{if(error.name!=='AbortError')setMessage(error.message);});return()=>controller.abort();},[selected]);
 async function createWorkspace(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();setBusy(true);const form=event.currentTarget;
  try {const response=await fetch('/api/workspaces',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:new FormData(form).get('name')})});const body=await response.json();if(!response.ok)throw new Error(body.error);setWorkspaces(prev=>[...prev,body]);setSelected(body.workspace_id);form.reset();setMessage('Workspace created.');}catch(error){setMessage(error instanceof Error?error.message:'Unable to create workspace');}finally{setBusy(false);}
 }
 async function createService(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();setBusy(true);const form=event.currentTarget;
  try {const response=await fetch(`/api/workspaces/${selected}/services`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const body=await response.json();if(!response.ok)throw new Error(body.error);const rows=await fetch(`/api/workspaces/${selected}/services`).then(response=>response.json());setServices(rows);form.reset();setMessage('Service registered in advise mode. Telemetry has not been connected.');}catch(error){setMessage(error instanceof Error?error.message:'Unable to register service');}finally{setBusy(false);}
 }
 const serviceContent=<><h2>Registered services</h2>{services.length?services.map(service=><article className="sc-card sc-detail-pad" key={service.id}><h3>{service.name}</h3><p>{service.owner} / {service.region} / {service.act?'Act enabled':'Advise mode'}</p>{workspaces.find(workspace=>workspace.workspace_id===selected)?.role==='admin'&&<><SloSetup workspaceId={selected} serviceId={service.id}/><GrafanaWebhook workspaceId={selected} serviceId={service.id}/></>}</article>):<section className="sc-card sc-detail-pad"><h3>No services registered</h3><p>Register a service to configure objectives and begin collecting evidence.</p></section>}{workspaces.find(workspace=>workspace.workspace_id===selected)?.role==='admin'&&<form onSubmit={createService}><h2>Register an ECS service</h2>{[['name','Service name'],['owner','Owner'],['account_id','AWS account ID'],['region','AWS region'],['resource_arn','ECS service ARN']].map(([name,label])=><label key={name}>{label}<input name={name} required maxLength={2048}/></label>)}<button disabled={busy}>Register service</button></form>}</>;
 if(section !== 'overview') return <section className="workspace-setup"><p role="status">{message}</p>{workspaces.length ? <><label>Active workspace<select value={selected} onChange={event=>setSelected(event.target.value)}>{workspaces.map(workspace=><option key={workspace.workspace_id} value={workspace.workspace_id}>{workspace.name}</option>)}</select></label>{section==='incidents'?<Investigations key={selected} workspaceId={selected} services={services} canStart={['admin','responder'].includes(workspaces.find(workspace=>workspace.workspace_id===selected)?.role??'')}/>:section==='services'?serviceContent:<WorkspaceAudit key={selected} workspaceId={selected}/>}</>:<a href="/dashboard">Set up your first workspace</a>}</section>;
 return <section className="workspace-setup">
  <p role="status">{message}</p>
  {workspaces.length>0&&<>
   <label>Active workspace<select value={selected} onChange={event=>setSelected(event.target.value)}>{workspaces.map(workspace=><option key={workspace.workspace_id} value={workspace.workspace_id}>{workspace.name}</option>)}</select></label>
   <div className="sc-product-stats">
    <section className="sc-card sc-detail-pad"><span className="sc-muted">Registered services</span><strong>{services.length}</strong><a href="/services">Manage service catalog →</a></section>
    <section className="sc-card sc-detail-pad"><span className="sc-muted">Your access</span><strong>{workspaces.find(workspace=>workspace.workspace_id===selected)?.role??'—'}</strong><a href="/audit">Review workspace activity →</a></section>
    <section className="sc-card sc-detail-pad"><span className="sc-muted">Operating mode</span><strong>Advise</strong><span className="sc-muted">Read-only investigation</span></section>
   </div>
   <Investigations key={selected} workspaceId={selected} services={services} canStart={['admin','responder'].includes(workspaces.find(workspace=>workspace.workspace_id===selected)?.role??'')}/>
   {!services.length&&<section className="sc-card sc-detail-pad"><h2>Connect your first service</h2><p>Add service ownership and reliability objectives, then configure alert intake.</p><a className="sc-button sc-primary" href="/services">Register a service →</a></section>}
  </>}
  <details open={!workspaces.length}><summary>{workspaces.length?'Create another workspace':'Create your first workspace'}</summary><form onSubmit={createWorkspace}><h2>Create workspace</h2><label>Workspace name<input name="name" required maxLength={200}/></label><button disabled={busy}>Create workspace</button></form></details>
  <details><summary>Account security</summary><PasskeySettings/></details>
 </section>;
}
