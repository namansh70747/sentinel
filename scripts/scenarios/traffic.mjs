import { pathToFileURL } from 'node:url';

export function scenarioTarget(raw) {
 const url = new URL(raw);
 if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('Traffic scenarios require an HTTP loopback origin');
 }
 return url;
}

export async function runTraffic({ target = 'http://127.0.0.1:9464', scenario = 'healthy', requests = 100 } = {}) {
 const origin = scenarioTarget(target);
 if (!['healthy', 'degradation', 'recovery'].includes(scenario)) throw new Error('Unknown scenario');
 if (!Number.isInteger(requests) || requests < 1 || requests > 10000) throw new Error('Requests must be between 1 and 10000');
 const counts = { success: 0, failure: 0, unavailable: 0 };
 for (let index = 0; index < requests; index += 1) {
  const path = scenario === 'degradation' ? (index % 2 === 0 ? '/fail' : '/slow?delayMs=250') : '/ok';
  try {
   const response = await fetch(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(7000) });
   await response.arrayBuffer();
   counts[response.ok ? 'success' : 'failure'] += 1;
  } catch { counts.unavailable += 1; }
 }
 return { scenario, target: origin.origin, requests, ...counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const result = await runTraffic({ target: process.env.SENTINEL_SCENARIO_TARGET, scenario: process.argv[2] ?? 'healthy', requests: Number(process.argv[3] ?? 100) });
 console.log(JSON.stringify(result));
 if (result.unavailable) process.exitCode = 1;
}
