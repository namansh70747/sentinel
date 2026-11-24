import { loadEnvFile } from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { hostedAdvisoryKeys, rankWithHostedProviders } from '@sentinel/connectors/incident-recommendation';
import { setTimeout as delay } from 'node:timers/promises';
import { SentinelDatabase } from '@sentinel/db';
import { AdvisoryShadow } from '../../apps/worker-read/src/advisory-shadow';

// Use an existing Ollama instance bound to loopback. The Compose worker runs
// the same loop when the optional container profile is available.
loadEnvFile('.local/compose.env');
const local = existsSync('.env')?parseEnv(readFileSync('.env','utf8')):{};
for(const name of ['GEMINI_API_KEY','NVIDIA_API_KEY','SENTINEL_ADVISORY_PROVIDER','SENTINEL_HOSTED_ADVISORY_WORKSPACES']){
 if(process.env[name]===undefined&&local[name]!==undefined)process.env[name]=local[name];
}
if(process.argv.includes('--check-hosted')){
 const keys=hostedAdvisoryKeys();
 const candidates=[{source:'prometheus',outcome:'not-configured',provenance:null}];
 let failed=false;
 for(const provider of ['gemini','nvidia'] as const){
  const key=keys[provider];
  const result=key?await rankWithHostedProviders(candidates,{[provider]:key}):null;
  console.log(JSON.stringify({provider,model:result?.model,status:result?.status??'missing-key',httpStatus:result?.httpStatus}));
  if(result?.status!=='accepted')failed=true;
 }
 process.exit(failed?1:0);
}
if(process.env.SENTINEL_ADVISORY_PROVIDER==='hosted'){
 const keys=hostedAdvisoryKeys();
 if(!keys.gemini&&!keys.nvidia)throw new Error('Hosted evaluator needs a configured provider key');
 if(!process.env.SENTINEL_HOSTED_ADVISORY_WORKSPACES?.trim())throw new Error('Hosted advisory needs an approved workspace');
}else{
 process.env.SENTINEL_RECOMMENDATION_OLLAMA_URL ??= 'http://127.0.0.1:11434';
 process.env.OLLAMA_MODEL ||= 'qwen2.5:0.5b';
 const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
 if (!response.ok) throw new Error('Local Ollama is unavailable');
 const inventory = await response.json() as {models?:{name:string}[]};
 if (!inventory.models?.some(model => model.name === process.env.OLLAMA_MODEL)) throw new Error('Configured model has not been loaded into Ollama');
}
const password = process.env.SENTINEL_DATABASE_PASSWORD;
if (!password) throw new Error('Run dev:prepare before starting the advisory evaluator');
const db = new SentinelDatabase('postgres://sentinel_app:' + encodeURIComponent(password) + '@127.0.0.1:55441/sentinel');
const evaluator = new AdvisoryShadow(db);
let running = true;
process.once('SIGTERM', () => { running = false; });
process.once('SIGINT', () => { running = false; });
console.log('Local advisory evaluator ready');
try {
 while (running) {
  try { await evaluator.tick(); }
  catch { console.error('Advisory evaluation failed'); }
  if (running) await delay(2000);
 }
} finally { await db.close(); }
