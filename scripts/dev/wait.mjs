const targets = [
 ['workload', 'http://127.0.0.1:9464/readyz'],
 ['prometheus', 'http://127.0.0.1:9090/-/ready'],
 ['loki', 'http://127.0.0.1:3100/ready'],
 ['tempo', 'http://127.0.0.1:3200/ready'],
 ['alloy', 'http://127.0.0.1:12345/-/ready'],
 ['grafana', 'http://127.0.0.1:3012/api/health'],
];
if(process.argv.includes('--core'))targets.push(
 ['console','http://127.0.0.1:3010/api/workspaces'],
 ['keycloak','http://localhost:8088/realms/sentinel/.well-known/openid-configuration'],
 ['ntfy','http://127.0.0.1:8091/v1/health'],
);
const deadline = Date.now() + 120000;
let pending = targets;
while (pending.length && Date.now() < deadline) {
 const results = await Promise.all(pending.map(async ([name,url]) => {
  try { const response=await fetch(url,{signal:AbortSignal.timeout(2000),redirect:'error'});return { name, ready: name==='console'?response.status===401:response.ok }; }
  catch { return {name,ready:false}; }
 }));
 pending = pending.filter(([name]) => !results.find(result=>result.name===name)?.ready);
 if(pending.length) await new Promise(resolve=>setTimeout(resolve,1000));
}
if(pending.length) { console.error(`Readiness timed out: ${pending.map(([name])=>name).join(', ')}`); process.exitCode=1; }
else console.log(`${targets.map(([name])=>name).join(', ')} passed readiness checks. Worker and end-to-end capability acceptance are separate checks.`);
