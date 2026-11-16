import { expect, it } from 'vitest';
// Scenario entry points run directly in Node, outside the TypeScript workspaces.
// @ts-expect-error JavaScript CLI module has no declaration file.
import { scenarioTarget, runTraffic } from '../../../scripts/scenarios/traffic.mjs';
import { createWorkload } from './server';

it.each(['https://example.com', 'http://169.254.169.254', 'http://localhost.evil.test', 'http://user:pass@localhost', 'http://localhost/path'])('rejects nonlocal scenario target %s', target => {
 expect(() => scenarioTarget(target)).toThrow();
});
it('produces real failures then healthy recovery requests', async () => {
 const server = createWorkload({ mode: 'local', log: () => {} });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const target = `http://127.0.0.1:${address.port}`;
  expect(await runTraffic({ target, scenario: 'degradation', requests: 2 })).toMatchObject({ success: 1, failure: 1, unavailable: 0 });
  expect(await runTraffic({ target, scenario: 'recovery', requests: 2 })).toMatchObject({ success: 2, failure: 0, unavailable: 0 });
 } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
