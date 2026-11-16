import { afterEach, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createWorkload } from './server';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))); });
async function start(mode: 'local' | 'production' = 'local') {
 const lines: Record<string, unknown>[] = [];
 const server = createWorkload({ mode, log: line => lines.push(line) });
 servers.push(server);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 if (!address || typeof address === 'string') throw new Error('No listening port');
 return { url: `http://127.0.0.1:${address.port}`, lines };
}
it('counts business failures while excluding metrics and readiness traffic', async () => {
 const { url } = await start();
 await fetch(`${url}/metrics`); await fetch(`${url}/healthz`);
 expect((await fetch(`${url}/fail`)).status).toBe(500);
 await fetch(`${url}/ok`);
 const metrics = await (await fetch(`${url}/metrics`)).text();
 expect(metrics).toMatch(/^workload_requests_total 2$/m);
 expect(metrics).toMatch(/^workload_requests_good 1$/m);
 expect(metrics).toMatch(/^workload_request_duration_seconds_count 2$/m);
 expect(metrics).toContain('workload_process_start_seconds');
});
it('measures actual delay and correlates the response with structured logs', async () => {
 const { url, lines } = await start();
 const response = await fetch(`${url}/slow?delayMs=60`);
 await response.text();
 const metrics = await (await fetch(`${url}/metrics`)).text();
 const sum = Number(metrics.match(/^workload_request_duration_seconds_sum (.+)$/m)?.[1]);
 expect(sum).toBeGreaterThanOrEqual(0.05);
 expect(response.headers.get('x-trace-id')).toMatch(/^[a-f0-9]{32}$/);
 expect(lines.find(line => line.requestId === response.headers.get('x-request-id'))?.traceId).toBe(response.headers.get('x-trace-id'));
});
it('disables fault endpoints in production', async () => {
 const { url } = await start('production');
 expect((await fetch(`${url}/fail`)).status).toBe(404);
 expect((await fetch(`${url}/slow?delayMs=10`)).status).toBe(404);
});
it('exports a failed request span with the same trace ID as its response and log', async () => {
 const exporter = new InMemorySpanExporter();
 const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
 const lines: Record<string, unknown>[] = [];
 const server = createWorkload({ mode: 'local', log: line => lines.push(line), tracer: provider.getTracer('workload-test') });
 servers.push(server);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 if (!address || typeof address === 'string') throw new Error('No port');
 const response = await fetch(`http://127.0.0.1:${address.port}/fail`);
 await response.text();
 await provider.forceFlush();
 const spans = exporter.getFinishedSpans();
 expect(spans).toHaveLength(1);
 expect(spans[0].spanContext().traceId).toBe(response.headers.get('x-trace-id'));
 expect(spans[0].attributes['http.response.status_code']).toBe(500);
 expect(lines[0].traceId).toBe(response.headers.get('x-trace-id'));
 await provider.shutdown();
});
