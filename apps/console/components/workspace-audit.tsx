'use client';
import { useEffect,useState } from 'react';
type Audit={events:{id:string;actor:string;action:string;created_at:string;payload:unknown}[];integrity:{verified:boolean;reason:string}};
export function WorkspaceAudit({workspaceId}:{workspaceId:string}) {
 const [data,setData]=useState<Audit|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{const controller=new AbortController();setData(null);setError('');fetch(`/api/workspaces/${workspaceId}/audit`,{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Unable to load audit history');return response.json();}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[workspaceId,version]);
 return <section><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Workspace audit</h2><button onClick={()=>setVersion(v=>v+1)}>Refresh audit</button></div><p role="status">{error||data?.integrity.reason||'Loading audit history…'}</p>{data?.events.map(event=><article key={event.id}><strong>{event.action}</strong><p>{new Date(event.created_at).toLocaleString()} / {event.actor}</p><details><summary>View recorded details</summary><pre style={{overflowX:'auto',fontSize:12}}>{JSON.stringify(event.payload,null,2)}</pre></details></article>)}</section>;
}
