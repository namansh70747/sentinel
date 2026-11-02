import { Pool } from 'pg';
if(process.env.CI!=='true'||!process.env.DATABASE_URL?.endsWith('/sentinel_test'))throw new Error('This grant is restricted to the disposable CI test database');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {await pool.query('GRANT UPDATE,DELETE ON audit_events TO sentinel_app');}
finally {await pool.end();}
