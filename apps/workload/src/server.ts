import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createMetrics } from './metrics';
import { SpanKind, SpanStatusCode, type Tracer } from '@opentelemetry/api';

export interface WorkloadOptions {
 mode: 'local' | 'production';
 serviceName?: string;
 log: (line: Record<string, unknown>) => void;
 tracer?: Tracer;
}

export function createWorkload(options: WorkloadOptions) {
 const metrics = createMetrics();
 return createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://workload');
  if (url.pathname === '/metrics') {
   res.writeHead(200, { 'content-type': metrics.registry.contentType });
   res.end(await metrics.registry.metrics());
   return;
  }
  if (url.pathname === '/healthz' || url.pathname === '/readyz') { res.writeHead(200); res.end('ok'); return; }
  const start = performance.now();
  const span = options.tracer?.startSpan('workload.request', { kind: SpanKind.SERVER, attributes: { 'http.request.method': req.method ?? 'GET', 'http.route': ['/ok', '/fail', '/slow'].includes(url.pathname) ? url.pathname : '/' } });
  const requestId = randomUUID(), traceId = span?.spanContext().traceId ?? randomBytes(16).toString('hex');
  const isFault = url.pathname === '/fail' || url.pathname === '/slow';
  const status = isFault && options.mode !== 'local' ? 404 : url.pathname === '/fail' ? 500 : 200;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-trace-id', traceId);
  if (url.pathname === '/slow' && options.mode === 'local') {
   const requested = Number(url.searchParams.get('delayMs') ?? 250);
   await delay(Number.isFinite(requested) ? Math.max(0, Math.min(5000, requested)) : 250);
  }
  const seconds = (performance.now() - start) / 1000;
  metrics.total.inc();
  if (status < 400) metrics.good.inc();
  metrics.duration.observe(seconds);
  span?.setAttribute('http.response.status_code', status);
  if (status >= 500) span?.setStatus({ code: SpanStatusCode.ERROR });
  options.log({ time: new Date().toISOString(), service: options.serviceName ?? 'workload', path: url.pathname, status, requestId, traceId, durationMs: seconds * 1000 });
  res.writeHead(status);
  res.end(status === 500 ? 'fail' : status === 404 ? 'not found' : 'ok');
  span?.end();
 });
}
