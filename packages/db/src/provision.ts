import { Pool } from 'pg';
const connectionString=process.env.DATABASE_URL,password=process.env.SENTINEL_DATABASE_PASSWORD;
if(!connectionString||!password||password.length<16)throw new Error('DATABASE_URL and SENTINEL_DATABASE_PASSWORD (16+ characters) are required');
const pool=new Pool({connectionString});const client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(75489322)');
 const role='sentinel_app';
 const existing=await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role]);
 if(existing.rowCount) {
  if(existing.rows[0].rolsuper||existing.rows[0].rolbypassrls)throw new Error('sentinel_app must not be a privileged role');
 } else {
  const sql=(await client.query("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', $1::text,$2::text) AS command",[role,password])).rows[0].command;
  await client.query(sql);
 }
 await client.query('GRANT USAGE ON SCHEMA public TO sentinel_app');
 await client.query('GRANT SELECT,INSERT,UPDATE ON workspaces,services,incidents,service_slos,investigation_jobs TO sentinel_app');
 await client.query('GRANT SELECT,INSERT ON audit_events,incident_evidence TO sentinel_app');
 await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON identities,workspace_memberships,login_transactions,sessions,passkeys,passkey_challenges,webhook_endpoints,webhook_deliveries TO sentinel_app');
 await client.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO sentinel_app');
 await client.query('COMMIT');console.log('Least-privilege runtime database role provisioned. Existing role credentials are preserved.');
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
