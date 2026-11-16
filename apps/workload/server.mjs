import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
let good = 0, bad = 0;
const server = createServer((req, res) => {
 const line = JSON.stringify({ time: new Date().toISOString(), path: req.url, status: req.url === '/fail' ? 500 : 200 });
 try { appendFileSync('/var/log/workload.log', `${line}\n`); } catch { /* stdout is the fallback */ }
 console.log(line);
 if (req.url === '/metrics') {
  res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
  res.end(`# TYPE workload_requests_good counter\nworkload_requests_good ${good}\n# TYPE workload_requests_total counter\nworkload_requests_total ${good + bad}\n# TYPE workload_latency_ms gauge\nworkload_latency_ms 42\n`);
  return;
 }
 if (req.url === '/fail') { bad += 1; res.writeHead(500); res.end('fail'); return; }
 good += 1; res.writeHead(200); res.end('ok');
});
server.listen(9464, '0.0.0.0');
