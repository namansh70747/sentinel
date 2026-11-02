import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSentinelServer } from './server';
const servers: Server[] = [];
async function start(demo = false) {
 const server = createSentinelServer({ demo });
 servers.push(server);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }))); });
describe('production and demo boundary', () => {
 it('never exposes fixture records or replay in production', async () => {
  const url = await start();
  expect(await (await fetch(`${url}/v1/services`)).json()).toEqual([]);
  expect(await (await fetch(`${url}/v1/incidents`)).json()).toEqual([]);
  expect((await fetch(`${url}/v1/incidents/inc-bad-deploy-advise`)).status).toBe(404);
  expect((await fetch(`${url}/v1/replay`, { method: 'POST' })).status).toBe(403);
  expect((await fetch(`${url}/v1/signals/grafana`, { method: 'POST' })).status).toBe(501);
 });
 it('requires explicit valid scenarios in opted-in demo mode', async () => {
  const url = await start(true);
  expect((await (await fetch(`${url}/v1/incidents`)).json()).length).toBeGreaterThan(0);
  for (const body of ['{}', '{', 'null', '{"scenario":"toString"}', '{"scenario":"missing"}']) {
   expect((await fetch(`${url}/v1/replay`, { method: 'POST', body })).status).toBe(400);
  }
  expect((await fetch(`${url}/v1/replay`, { method: 'POST', body: 'x'.repeat(65537) })).status).toBe(413);
  expect((await fetch(`${url}/healthz`)).status).toBe(200);
  expect((await fetch(`${url}/v1/replay`, { method: 'POST', body: JSON.stringify({ scenario: 'bad-deploy-advise' }) })).status).toBe(202);
 });
});
