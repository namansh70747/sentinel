import { loadEnvFile } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { SentinelDatabase } from '@sentinel/db';
import { AdvisoryShadow } from '../../apps/worker-read/src/advisory-shadow';

// Use an existing Ollama instance bound to loopback. The Compose worker runs
// the same loop when the optional container profile is available.
loadEnvFile('.local/compose.env');
process.env.SENTINEL_RECOMMENDATION_OLLAMA_URL ??= 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL ||= 'qwen2.5:0.5b';
const password = process.env.SENTINEL_DATABASE_PASSWORD;
if (!password) throw new Error('Run dev:prepare before starting the advisory evaluator');
const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
if (!response.ok) throw new Error('Local Ollama is unavailable');
const inventory = await response.json() as {models?:{name:string}[]};
if (!inventory.models?.some(model => model.name === process.env.OLLAMA_MODEL)) throw new Error('Configured model has not been loaded into Ollama');
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
