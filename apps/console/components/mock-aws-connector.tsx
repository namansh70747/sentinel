"use client";
import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronRight, Clock3, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Server, ShieldCheck, TriangleAlert } from 'lucide-react';
import { MockEcsReadClient } from '../../../packages/connectors/src/ecs-mock';

function credentials(){const id=globalThis.crypto?.randomUUID?.().replaceAll('-','').toUpperCase()??Date.now().toString(16).toUpperCase();return {access:`DEMO_ONLY_ACCESS_${id}`,secret:`DEMO_ONLY_SECRET_${id.toLowerCase()}`};}
const checks=['Validate sandbox configuration','Resolve checkout-api service','Verify read-only capabilities'];
export function MockAwsConnector(){
 const [keys,setKeys]=useState({access:'DEMO_ONLY_ACCESS_SENTINEL2026',secret:'DEMO_ONLY_SECRET_sentinel2026'});
 const [account,setAccount]=useState('000000000000');const [region,setRegion]=useState('ap-south-1');
 const [status,setStatus]=useState<'idle'|'checking'|'connected'|'error'>('idle');const [message,setMessage]=useState('');
 const [step,setStep]=useState(0);const [checkedAt,setCheckedAt]=useState('');const [reveal,setReveal]=useState(false);
 const generation=useRef(0);useEffect(()=>()=>{generation.current++;},[]);
 const checking=status==='checking';
 function change(){generation.current++;setStatus('idle');setMessage('');setCheckedAt('');}
 async function test(){
  const token=++generation.current;setStatus('checking');setMessage('');setStep(0);setCheckedAt('');
  for(let i=0;i<checks.length;i++){
   setStep(i);await new Promise(resolve=>setTimeout(resolve,450));if(token!==generation.current)return;
   if(i===0){
    if(!/^DEMO_ONLY_ACCESS_[A-Z0-9]+$/.test(keys.access)||!/^DEMO_ONLY_SECRET_[a-z0-9]+$/.test(keys.secret)){
     setStatus('error');setMessage('Credential profile is not valid for this simulation. Select Generate sandbox profile to restore the demo values.');return;
    }
    if(account!=='000000000000'||region!=='ap-south-1'){
     setStatus('error');setMessage('Resource binding mismatch. This simulation uses account 000000000000 in ap-south-1. Restore the sandbox profile and retry.');return;
    }
   }
  }
  try{const observation=await new MockEcsReadClient('healthy').observe();if(token!==generation.current)return;setStatus('connected');setCheckedAt(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Kolkata'}));setMessage(`checkout-api resolved successfully. ${observation.runningCount} of ${observation.desiredCount} tasks are healthy; read-only evidence collection is available in this simulation.`);}catch{if(token!==generation.current)return;setStatus('error');setMessage('The sandbox adapter did not return service context. Retry the connection check.');}
 }
 return <section className="sc-card sc-mock-config">
  <div className="sc-card-heading"><h2><Server size={17}/>Amazon Web Services <ChevronRight size={12}/><span className="sc-aws-subtitle">ECS connector</span></h2><span className="sc-badge purple">Simulated</span></div>
  <div className="sc-aws-layout"><div className="sc-mock-body">
   <div className="sc-aws-title"><span className="sc-aws-mark">aws<span>⌣</span></span><div><h3>Sentinel sandbox</h3><p>Service discovery & deployment evidence</p></div><span className={`sc-badge ${status==='connected'?'good':status==='error'?'danger':'neutral'}`}>{status==='connected'?'Verified':status==='checking'?'Checking':status==='error'?'Check failed':'Not verified'}</span></div>
   <div className="sc-mock-fields">
    <label>Access key ID<input autoComplete="off" spellCheck={false} disabled={checking} value={keys.access} onChange={e=>{setKeys({...keys,access:e.target.value});change();}}/></label>
    <label>Secret access key<div className="sc-secret-field"><input type={reveal?'text':'password'} autoComplete="off" spellCheck={false} disabled={checking} value={keys.secret} onChange={e=>{setKeys({...keys,secret:e.target.value});change();}}/><button type="button" aria-label={reveal?'Hide secret access key':'Show secret access key'} onClick={()=>setReveal(!reveal)}>{reveal?<EyeOff size={15}/>:<Eye size={15}/>}</button></div></label>
    <label>AWS account ID<input autoComplete="off" disabled={checking} value={account} onChange={e=>{setAccount(e.target.value);change();}}/></label>
    <label>Region<select disabled={checking} value={region} onChange={e=>{setRegion(e.target.value);change();}}><option value="ap-south-1">Asia Pacific (Mumbai) · ap-south-1</option><option value="us-east-1">US East (N. Virginia) · us-east-1</option><option value="eu-west-1">Europe (Ireland) · eu-west-1</option></select></label>
   </div>
   <div className="sc-mock-actions"><button className="sc-button sc-secondary" disabled={checking} onClick={()=>{setKeys(credentials());setAccount('000000000000');setRegion('ap-south-1');change();}}><KeyRound size={14}/>Generate sandbox profile</button><button className="sc-button sc-primary" disabled={checking} onClick={test}>{checking?<Loader2 className="sc-spin" size={14}/>:status==='connected'?<RefreshCw size={14}/>:<ShieldCheck size={14}/>} {checking?'Verifying connection…':status==='connected'?'Recheck connection':'Test connection'}</button></div>
   {checking&&<div className="sc-aws-checks" aria-live="polite">{checks.map((label,i)=><div key={label} className={i<=step?'current':''}>{i<step?<CheckCircle2 size={15}/>:i===step?<Loader2 size={15} className="sc-spin"/>:<Clock3 size={15}/>}<span>{label}</span><small>{i<step?'Passed':i===step?'Checking':'Queued'}</small></div>)}</div>}
   {message&&<div role="status" className={`sc-mock-result ${status==='error'?'error':''}`}>{status==='error'?<TriangleAlert size={17}/>:<CheckCircle2 size={17}/>}<div><strong>{status==='error'?'Connection check failed':'Sandbox connection verified'}</strong><p>{message}</p>{checkedAt&&<small>Last checked {checkedAt} IST · local simulation</small>}</div></div>}
   <p className="sc-mock-note">Simulated connection · local fixtures only. Generated credentials cannot access AWS and stay in this session.</p>
  </div><aside className="sc-aws-details"><div className="sc-aws-detail-heading"><ShieldCheck size={16}/><strong>Connection scope</strong></div><dl><div><dt>Authentication</dt><dd>Access key profile</dd></div><div><dt>Workspace</dt><dd>Sentinel sandbox</dd></div><div><dt>Cluster</dt><dd>sentinel-demo</dd></div><div><dt>Service</dt><dd>checkout-api</dd></div><div><dt>Access mode</dt><dd>Read-only</dd></div></dl><div className="sc-aws-permissions"><strong>Simulated capability checks</strong>{['ecs:DescribeServices','ecs:DescribeTaskDefinition'].map(x=><div key={x}><Check size={12}/><code>{x}</code><span>{status==='connected'?'Verified':'Configured'}</span></div>)}<p><ShieldCheck size={13}/>Infrastructure writes disabled</p></div><div className="sc-aws-region"><span>ap-south-1</span><strong>Mumbai, India</strong><small>Fictional AWS account · 000000000000</small></div></aside></div>
 </section>;
}
