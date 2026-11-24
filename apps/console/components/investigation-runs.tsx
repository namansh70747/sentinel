'use client';
import { CloudWatchDetail, EvidenceContext, evidenceStatus } from './source-list';
import { useEffect,useRef,useState } from 'react';
import { RefreshCw } from 'lucide-react';
interface Run {id:string;status:string;created_at:string;summary:string|null}
interface RunDetail extends Run {
 advisory_model_result?:{status:string;provider?:string;durationMs?:number}|null;
 advisory?:{nextStep:string;mode:string;explanation?:string;evidenceRefs:string[]}|null;
 attempts:{source:string;id:string;connector_id:string|null;config_version:number|null}[];
 evidence:{source:string;outcome:string;provenance:string|null;detail:unknown;observed_at:string|null;collected_at:string}[];
}
export function InvestigationRuns({workspaceId,incidentId}:{workspaceId:string;incidentId:string}){
 const [runs,setRuns]=useState<Run[]>([]),[selected,setSelected]=useState(''),[detail,setDetail]=useState<RunDetail|null>(null);
 const [allowed,setAllowed]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const base=`/api/workspaces/${workspaceId}`;
 const scope=`${workspaceId}:${incidentId}`,activeScope=useRef(scope);activeScope.current=scope;
 useEffect(()=>{
  let active=true;const controller=new AbortController();setSelected('');setDetail(null);setRuns([]);setLoading(true);setError('');setAllowed(false);
  fetch('/api/workspaces',{signal:controller.signal,cache:'no-store'}).then(response=>response.json()).then(rows=>{if(active&&Array.isArray(rows))setAllowed(rows.some(row=>row.workspace_id===workspaceId&&['admin','responder'].includes(row.role)));}).catch(()=>{});
  const load=async()=>{try{
   const response=await fetch(`${base}/incidents/${incidentId}/investigations`,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new Error('Unable to load investigation runs');const rows:Run[]=await response.json();
   if(active){setRuns(rows);setSelected(current=>current||rows[0]?.id||'');}
  }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Unable to load investigation runs');}finally{if(active)setLoading(false);}};
  void load();const timer=setInterval(load,5000);return()=>{active=false;controller.abort();clearInterval(timer);};
 },[base,incidentId,workspaceId]);
 useEffect(()=>{
  setDetail(null);if(!selected)return;let active=true;const controller=new AbortController();
  const load=async()=>{try{const response=await fetch(`${base}/investigations/${selected}`,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('Unable to load run evidence');const value=await response.json();if(active)setDetail(value);}catch(cause){if(active)setError(cause instanceof Error?cause.message:'Unable to load run evidence');}};
  void load();const timer=setInterval(load,3000);return()=>{active=false;controller.abort();clearInterval(timer);};
 },[base,selected]);
 async function refresh(){
  setBusy(true);setError('');try{
   const response=await fetch(`${base}/incidents/${incidentId}/investigations`,{method:'POST'});const value=await response.json();if(!response.ok)throw new Error(value.error??'Unable to request investigation');
   if(activeScope.current===scope){setRuns(current=>[value,...current]);setSelected(value.id);}
  }catch(cause){if(activeScope.current===scope)setError(cause instanceof Error?cause.message:'Unable to request investigation');}finally{if(activeScope.current===scope)setBusy(false);}
 }
 return <section className="sc-card sc-detail-pad" aria-label="Investigation runs">
  <div className="sc-heading"><div><h2>Fresh investigations</h2><p>Each refresh keeps its own evidence and configuration versions.</p></div>{allowed&&<button className="sc-button sc-primary" disabled={busy} onClick={refresh}><RefreshCw size={15}/>{busy?'Requesting…':'Refresh investigation'}</button>}</div>
  {error&&<p role="alert">{error}</p>}
  {loading?<p role="status">Loading investigation runs…</p>:!runs.length?<p>No refresh runs yet. Existing evidence remains available below.</p>:<>
   <label>Investigation run<select value={selected} onChange={event=>setSelected(event.target.value)}>{runs.map(run=><option key={run.id} value={run.id}>{new Date(run.created_at).toLocaleString()} · {run.status} · {run.id.slice(0,8)}</option>)}</select></label>
   {!detail?<p role="status">Loading run evidence…</p>:<><p role="status">{detail.status} · {detail.evidence.length} of {detail.attempts.length} source attempts persisted</p>{detail.summary&&<p>{detail.summary}</p>}
    {detail.advisory&&<article className="sc-card sc-detail-pad"><h3>What to do next</h3>{detail.advisory.explanation&&<p>{detail.advisory.explanation}</p>}<p>{detail.advisory.nextStep}</p><small>{detail.advisory.mode==='rules'?'Evidence rules':'Model-assisted'}{detail.advisory.evidenceRefs.length>0&&' · See the marked evidence below'}</small>{detail.advisory_model_result?.durationMs!==undefined&&<p><small>Model evaluation · {detail.advisory_model_result.status} · {detail.advisory_model_result.durationMs} ms</small></p>}</article>}
    <div className="sc-connector-grid">{detail.attempts.map(attempt=>{const evidence=detail.evidence.find(row=>row.source===attempt.source);return <article className="sc-card sc-detail-pad" key={attempt.id}>
     <h3>{attempt.source==='cloudwatch-logs'?'CloudWatch Logs':attempt.source}</h3>{detail.advisory?.evidenceRefs.includes(attempt.id)&&<small>Supports the recommendation</small>}<p>{evidenceStatus(evidence?.detail,evidence?.outcome??'Pending')} · {evidence?.provenance??'No observation'}</p><small>{attempt.config_version?`Connector configuration v${attempt.config_version}`:'No connector snapshot'}</small>
     {evidence&&<><p>{evidence.observed_at?'Observed '+new Date(evidence.observed_at).toLocaleString():'Recorded '+new Date(evidence.collected_at).toLocaleString()}</p>{attempt.source==='cloudwatch'&&<CloudWatchDetail detail={evidence.detail}/>}<EvidenceContext source={attempt.source} detail={evidence.detail}/><details><summary>View evidence envelope</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:320,overflow:'auto'}}>{JSON.stringify(evidence.detail,null,2)}</pre></details></>}
    </article>;})}</div>
   </>}
  </>}
 </section>;
}
