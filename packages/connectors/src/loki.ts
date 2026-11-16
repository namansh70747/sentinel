import { assertAllowed } from './egress';
export class LokiClient {
 constructor(private readonly baseUrl: string) {}
 async queryRange(query: string, startNs: string, endNs: string, limit = 20) {
  const url = assertAllowed(this.baseUrl);
  url.pathname = '/loki/api/v1/query_range';
  url.searchParams.set('query', query);
  url.searchParams.set('start', startNs);
  url.searchParams.set('end', endNs);
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok) throw new Error(`Loki request failed (${response.status})`);
  const body = await response.json() as { status?: string; data?: { result?: { values?: [string, string][] }[] } };
  if (body.status !== 'success' || !Array.isArray(body.data?.result)) throw new Error('Invalid Loki response');
  return body.data.result.flatMap(stream => stream.values ?? []).slice(0, limit);
 }
}
