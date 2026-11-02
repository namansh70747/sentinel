import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { SentinelDatabase } from './index';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Postgres workspace isolation and audit durability', () => {
 const db = new SentinelDatabase(url!);
 const a = randomUUID(), b = randomUUID();
 beforeAll(async () => {
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2),($3,$4)', [a,'Test A',b,'Test B']);
 });
 afterAll(() => db.close());
 it('serializes concurrent appends and blocks ledger mutation', async () => {
  await Promise.all(Array.from({ length: 8 }, (_, i) => db.appendAudit(a,'test','test.append',{ i })));
  const rows = await db.inWorkspace(a, async client => (await client.query('SELECT * FROM audit_events WHERE workspace_id=$1 ORDER BY sequence', [a])).rows);
  expect(rows).toHaveLength(8);
  expect(rows[0].previous_hash).toBe('0'.repeat(64));
  for (let i = 1; i < rows.length; i++) expect(rows[i].previous_hash).toBe(rows[i-1].hash);
  await expect(db.inWorkspace(a, client => client.query('UPDATE audit_events SET actor=$1 WHERE workspace_id=$2', ['tamper',a]))).rejects.toThrow('append-only');
  await expect(db.inWorkspace(a, client => client.query('DELETE FROM audit_events WHERE workspace_id=$1',[a]))).rejects.toThrow('append-only');
 });
 it('does not leak tenant scope when pooled connections are reused', async () => {
  await db.appendAudit(b,'test','test.other',{});
  const aRows = await db.inWorkspace(a, async client => (await client.query('SELECT * FROM audit_events')).rows);
  const bRows = await db.inWorkspace(b, async client => (await client.query('SELECT * FROM audit_events')).rows);
  expect(aRows.every(row => row.workspace_id === a)).toBe(true);
  expect(bRows).toHaveLength(1);
  expect(bRows[0].workspace_id).toBe(b);
  await expect(db.inWorkspace(a, client => client.query('INSERT INTO audit_events(workspace_id,id,actor,action,payload,previous_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[b,randomUUID(),'attacker','test',{},'0'.repeat(64),'a'.repeat(64)]))).rejects.toThrow();
 });
});
