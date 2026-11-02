import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrometheusClient } from './prometheus';
afterEach(() => vi.unstubAllGlobals());
describe('Prometheus live adapter', () => {
 it('queries a prefixed endpoint and authenticates server-side', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [{ metric: { service: 'web' }, value: [123, '0.999'] }] } })));
  vi.stubGlobal('fetch', fetcher);
  const result = await new PrometheusClient({ url: 'https://metrics.example/prometheus', token: 'secret' }).query('sum(up)');
  expect(result[0].value[1]).toBe('0.999');
  expect(fetcher.mock.calls[0][0].pathname).toBe('/prometheus/api/v1/query');
  expect(fetcher.mock.calls[0][0].searchParams.get('query')).toBe('sum(up)');
  expect(fetcher.mock.calls[0][1].headers.authorization).toBe('Bearer secret');
 });
 it('reports failed health and rejects nonfinite observations', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  expect((await new PrometheusClient({ url: 'https://metrics.example' }).health()).healthy).toBe(false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [1, 'NaN'] }] } }))));
  await expect(new PrometheusClient({ url: 'https://metrics.example' }).query('up')).rejects.toThrow('Invalid Prometheus sample');
 });
});
