import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(75489321)");
 await client.query('CREATE TABLE IF NOT EXISTS sentinel_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for (const version of ['0001_foundation', '0002_identity', '0003_telemetry', '0004_investigation_jobs', '0005_audit_versions', '0006_passkeys', '0007_webhooks']) {
 if (!(await client.query('SELECT version FROM sentinel_migrations WHERE version=$1', [version])).rowCount) {
  await client.query(await readFile(new URL(`../migrations/${version}.sql`, import.meta.url), 'utf8'));
  await client.query('INSERT INTO sentinel_migrations(version) VALUES($1)', [version]);
 }
 }
 await client.query('COMMIT');
 console.log('Database migrations applied');
} catch(error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
