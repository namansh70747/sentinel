import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export function createMetrics() {
 const registry = new Registry();
 const total = new Counter({ name: 'workload_requests_total', help: 'Completed business requests', registers: [registry] });
 const good = new Counter({ name: 'workload_requests_good', help: 'Successful business requests', registers: [registry] });
 const duration = new Histogram({ name: 'workload_request_duration_seconds', help: 'Business request duration in seconds', buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [registry] });
 new Gauge({ name: 'workload_process_start_seconds', help: 'Process start in Unix seconds', registers: [registry] }).set(Date.now() / 1000 - process.uptime());
 return { registry, total, good, duration };
}
