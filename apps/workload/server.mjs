import { appendFileSync } from 'node:fs';
import { createWorkload } from './src/server.ts';
import { startTracing } from './src/tracing.ts';
const telemetry = startTracing(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
const server = createWorkload({
 tracer: telemetry?.tracer,
 mode: process.env.SENTINEL_WORKLOAD_MODE === 'local' ? 'local' : 'production',
 serviceName: process.env.OTEL_SERVICE_NAME || 'workload',
 log(entry) {
  const line = JSON.stringify(entry);
  try { appendFileSync(process.env.WORKLOAD_LOG_FILE ?? '/var/log/workload.log', `${line}\n`); } catch { /* stdout remains available */ }
  console.log(line);
 },
});
server.listen(Number(process.env.WORKLOAD_PORT ?? 9464), '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
 server.close(async () => { await telemetry?.shutdown(); process.exit(0); });
});
