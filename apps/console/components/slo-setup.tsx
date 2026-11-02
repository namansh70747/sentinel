'use client';
import { useState,type FormEvent } from 'react';
export function SloSetup({workspaceId,serviceId}:{workspaceId:string;serviceId:string}) {
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function save(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();setBusy(true);const values=Object.fromEntries(new FormData(event.currentTarget));
  try {const response=await fetch(`/api/workspaces/${workspaceId}/services/${serviceId}/slo`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...values,availabilityTarget:Number(values.availabilityTarget),latencyTargetMs:Number(values.latencyTargetMs)})});const body=await response.json();if(!response.ok)throw new Error(body.error);setMessage('SLO queries saved. Collection requires a configured Prometheus read worker.');}catch(error){setMessage(error instanceof Error?error.message:'Unable to save SLO');}finally{setBusy(false);}
 }
 return <details><summary>Configure SLO queries</summary><form onSubmit={save}><label>Availability target (ratio)<input name="availabilityTarget" type="number" min="0.000001" max="0.999999" step="any" defaultValue="0.999" required/></label><label>Latency target (milliseconds)<input name="latencyTargetMs" type="number" min="1" defaultValue="300" required/></label><p>Good and total queries must return request counts for the {'{window}'} placeholder (5m, 30m, 1h and 6h). Latency query must return milliseconds. Each query must return one series.</p>{[['goodQuery','Good request query'],['totalQuery','Total request query'],['latencyQuery','p99 latency query']].map(([name,label])=><label key={name}>{label}<input name={name} required maxLength={16384}/></label>)}<button disabled={busy}>{busy?'Saving…':'Save SLO queries'}</button><p role="status">{message}</p></form></details>;
}
