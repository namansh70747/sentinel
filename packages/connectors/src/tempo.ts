import { assertAllowed } from './egress';
export class TempoClient {
 constructor(private readonly baseUrl: string) {}
 async search(query: string, start: number, end: number) {
  const url = assertAllowed(this.baseUrl);
  url.pathname = '/api/search';
  url.searchParams.set('q', query);
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok) throw new Error(`Tempo request failed (${response.status})`);
  const body = await response.json() as { traces?: unknown[] };
  if (!Array.isArray(body.traces)) throw new Error('Invalid Tempo response');
  return body.traces;
 }
}
