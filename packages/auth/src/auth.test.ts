import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
import { SentinelAuth } from './index';
const config = { issuer:'https://identity.example',clientId:'sentinel',clientSecret:'test',redirectUri:'http://localhost:3010/api/auth/callback' };
it('rejects insecure remote identity providers and callbacks', () => {
 const db = {} as SentinelDatabase;
 expect(() => new SentinelAuth(db,{...config,issuer:'http://identity.example'})).toThrow();
 expect(() => new SentinelAuth(db,{...config,redirectUri:'http://console.example/callback'})).toThrow();
});
describe.skipIf(!process.env.TEST_DATABASE_URL)('persistent sessions', () => {
 const db = new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 const auth = new SentinelAuth(db,config), identity = randomUUID(), raw = randomBytes(32).toString('base64url');
 const tokenHash = createHash('sha256').update(raw).digest('hex');
 beforeAll(async () => {
  await db.pool.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3)',[identity,config.issuer,identity]);
  await db.pool.query("INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash,identity]);
 });
 afterAll(() => db.close());
 it('rejects unknown and expired tokens and revokes sessions', async () => {
  expect(await auth.session('unknown')).toBeNull();
  expect((await auth.session(raw))?.id).toBe(identity);
  await auth.revoke(raw);
  expect(await auth.session(raw)).toBeNull();
  await db.pool.query("INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,now()-interval '1 second')",[tokenHash,identity]);
  expect(await auth.session(raw)).toBeNull();
 });
 it('does not accept arbitrary callback origins', async () => {
  await expect(auth.complete('test',new URL('https://attacker.example/api/auth/callback'))).rejects.toThrow('Invalid callback');
 });
});
