import { describe, expect, it, vi } from 'vitest';
import { publishNtfy } from './ntfy';
describe('ntfy publish', () => {
 it('posts once to the configured local server', async () => {
  const fetchMock = vi.fn(async () => new Response('ok'));
  vi.stubGlobal('fetch', fetchMock);
  await publishNtfy('http://127.0.0.1:8091', 'sentinel-research-topic', 'incident abc advised');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const called = fetchMock.mock.calls as unknown as [string][];
  expect(String(called[0][0])).toContain('127.0.0.1:8091');
  vi.unstubAllGlobals();
 });
});
