const targets = [
 ['workload', 'http://127.0.0.1:9464/readyz'],
 ['prometheus', 'http://127.0.0.1:9090/-/ready'],
 ['loki', 'http://127.0.0.1:3100/ready'],
 ['tempo', 'http://127.0.0.1:3200/ready'],
 ['alloy', 'http://127.0.0.1:12345/-/ready'],
 ['grafana', 'http://127.0.0.1:3012/api/health'],
];
const deadline = Date.now() + 120000;
let pending = targets;
while (pending.length && Date.now() < deadline) {
 const results = await Promise.all(pending.map(async ([name,url]) => {
  try { return { name, ready: (await fetch(url,{signal:AbortSignal.timeout(2000),redirect:'error'})).ok }; }
  catch { return {name,ready:false}; }
 }));
 pending = pending.filter(([name]) => !results.find(result=>result.name===name)?.ready);
 if(pending.length) await new Promise(resolve=>setTimeout(resolve,1000));
}
if(pending.length) { console.error(`Readiness timed out: ${pending.map(([name])=>name).join(', ')}`); process.exitCode=1; }
else console.log('Workload, telemetry providers, Alloy and Grafana are ready.');
