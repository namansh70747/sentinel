'use client';
import { startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
export function PasskeySettings() {
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function enroll(){setBusy(true);try{const optionsResponse=await fetch('/api/auth/passkeys/options',{method:'POST'});const body=await optionsResponse.json();if(!optionsResponse.ok)throw new Error(body.error);const response=await startRegistration({optionsJSON:body.options});const result=await fetch('/api/auth/passkeys/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challengeId:body.challengeId,response})});const verified=await result.json();if(!result.ok)throw new Error(verified.error);setMessage('Passkey registered. Production approvals remain unavailable until actuation gates are implemented.');}catch(error){setMessage(error instanceof Error?error.message:'Enrollment failed');}finally{setBusy(false);}}
 return <section className="connection-panel"><div><h2>Security</h2><p>Add a passkey for future approval verification. Requires sign-in within the last five minutes.</p><p role="status">{message}</p></div><button onClick={enroll} disabled={busy}>{busy?'Registering…':'Add passkey'}</button></section>;
}
