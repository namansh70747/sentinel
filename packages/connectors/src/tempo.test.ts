import { describe, expect, it, vi } from 'vitest';
import { TempoClient } from './tempo';
describe('Tempo search', () => {
 it('returns an empty trace list without inventing a span', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ traces: [] }))));
  expect(await new TempoClient('http://127.0.0.1:3200').search('{resource.service.name="workload"}', 1, 2)).toEqual([]);
  vi.unstubAllGlobals();
 });
});
