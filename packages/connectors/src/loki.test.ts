import { describe, expect, it, vi } from 'vitest';
import { LokiClient } from './loki';
describe('Loki range query', () => {
 it('uses query_range and returns lines', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'success', data: { result: [{ values: [['1', 'GET /fail 500']] }] } }))));
  const lines = await new LokiClient('http://127.0.0.1:3100').queryRange('{job="workload"}', '1', '2');
  expect(lines[0][1]).toBe('GET /fail 500');
  vi.unstubAllGlobals();
 });
});
