'use client';
import { useState } from 'react';
type Health = { state: string; checkedAt: string | null; message: string };
export function ConnectionHealth() {
 const [health, setHealth] = useState<Health | null>(null);
 const [pending, setPending] = useState(false);
 async function check() {
  setPending(true);
  try {
   const response = await fetch('/api/connections/prometheus/health', { cache: 'no-store' });
   const result = await response.json() as Health;
   setHealth(result);
  } catch { setHealth({ state: 'unreachable', checkedAt: null, message: 'Unable to reach the console server. Retry the check.' }); }
  finally { setPending(false); }
 }
 return <section className="connection-panel"><div><h2>Prometheus connection</h2><p>Verify your configured metrics endpoint. This checks connectivity; it does not ingest services or incidents.</p><p role="status">{pending ? 'Checking connection…' : health ? `${health.state}: ${health.message}` : 'Not checked yet.'}</p>{health?.checkedAt && <small>Last checked {new Date(health.checkedAt).toLocaleString()}</small>}</div><button type="button" disabled={pending} onClick={check}>{pending ? 'Checking…' : 'Check connection'}</button></section>;
}
