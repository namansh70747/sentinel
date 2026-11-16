"use client";
import { useState } from 'react';
import { CheckCircle2, FlaskConical, Loader2, RefreshCw, Server, TriangleAlert } from 'lucide-react';
import { MockEcsReadClient } from '../../../packages/connectors/src/ecs-mock';

function credentials(){const id=globalThis.crypto?.randomUUID?.().replaceAll('-','').toUpperCase()??Date.now().toString(16).toUpperCase();return {access:`DEMO_ONLY_ACCESS_${id}`,secret:`DEMO_ONLY_SECRET_${id.toLowerCase()}`};}
export function MockAwsConnector(){
 const [keys,setKeys]=useState({access:'DEMO_ONLY_ACCESS_SENTINEL2026',secret:'DEMO_ONLY_SECRET_sentinel2026'});
 const [account,setAccount]=useState('000000000000');const [region,setRegion]=useState('ap-south-1');
 const [status,setStatus]=useState<'idle'|'checking'|'connected'|'error'>('idle');const [message,setMessage]=useState('');
 const checking=status==='checking';
 function change(){setStatus('idle');setMessage('');}
 async function test(){
  setStatus('checking');setMessage('');
  await new Promise(resolve=>setTimeout(resolve,650));
  if(!/^DEMO_ONLY_ACCESS_[A-Z0-9]+$/.test(keys.access)||!/^DEMO_ONLY_SECRET_[a-z0-9]+$/.test(keys.secret)){
   setStatus('error');setMessage('Use Generate demo credentials. Only DEMO_ONLY placeholders are accepted; do not enter real credentials.');return;
  }
  if(account!=='000000000000'||region!=='ap-south-1'){
   setStatus('error');setMessage('This mock connector is bound to fictional account 000000000000 in ap-south-1. Restore these demo values and retry.');return;
  }
  try{const observation=await new MockEcsReadClient('healthy').observe();setStatus('connected');setMessage(`Mock connection verified · checkout-api · ${observation.runningCount}/${observation.desiredCount} tasks running. Synthetic adapter response; AWS authentication was not performed.`);}catch{setStatus('error');setMessage('Mock adapter could not return an observation. Retry the demo test.');}
 }
 return <section className="sc-card sc-mock-config">
  <div className="sc-card-heading"><h2><Server size={17}/>AWS sandbox connector</h2><span className={`sc-badge ${status==='connected'?'good':'purple'}`}>{status==='connected'?'Mock connected':'Demo configuration'}</span></div>
  <div className="sc-mock-body"><div className="sc-mock-intro"><FlaskConical size={18}/><p>Configure the prototype with generated dummy credentials. These values are intentionally invalid for AWS and only unlock the local mock connection test.</p></div>
   <div className="sc-mock-fields">
    <label>Access key ID <span>DEMO ONLY</span><input autoComplete="off" spellCheck={false} disabled={checking} value={keys.access} onChange={e=>{setKeys({...keys,access:e.target.value});change();}}/></label>
    <label>Secret access key <span>DEMO ONLY</span><input type="password" autoComplete="off" spellCheck={false} disabled={checking} value={keys.secret} onChange={e=>{setKeys({...keys,secret:e.target.value});change();}}/></label>
    <label>AWS account ID<input autoComplete="off" disabled={checking} value={account} onChange={e=>{setAccount(e.target.value);change();}}/></label>
    <label>Region<input autoComplete="off" disabled={checking} value={region} onChange={e=>{setRegion(e.target.value);change();}}/></label>
   </div>
   <div className="sc-mock-actions"><button className="sc-button sc-secondary" disabled={checking} onClick={()=>{setKeys(credentials());setAccount('000000000000');setRegion('ap-south-1');change();}}><RefreshCw size={14}/>Generate demo credentials</button><button className="sc-button sc-primary" disabled={checking} onClick={test}>{checking?<Loader2 className="sc-spin" size={14}/>:<CheckCircle2 size={14}/>} {checking?'Testing mock connection…':'Test mock connection'}</button></div>
   {message&&<div role="status" className={`sc-mock-result ${status==='error'?'error':''}`}>{status==='error'?<TriangleAlert size={17}/>:<CheckCircle2 size={17}/>}<p>{message}</p></div>}
   <p className="sc-mock-note">Demo keys stay in memory and are never sent to AWS or saved to browser storage. Reloading restores the sample values. Investigations use the same mock ECS adapter independently.</p>
  </div>
 </section>;
}
