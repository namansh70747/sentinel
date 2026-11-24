import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace } from '@opentelemetry/api';

export function startTracing(endpoint: string | undefined) {
 if (!endpoint) return undefined;
 const url = new URL(endpoint);
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid OTLP endpoint');
 const sdk = new NodeSDK({ serviceName: process.env.OTEL_SERVICE_NAME || 'workload', traceExporter: new OTLPTraceExporter({ url: url.toString(), timeoutMillis: 3000 }) });
 sdk.start();
 return { tracer: trace.getTracer('sentinel-workload', '0.1.0'), shutdown: () => sdk.shutdown() };
}
