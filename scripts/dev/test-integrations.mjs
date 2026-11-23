import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
loadEnvFile('.local/compose.env');
const port=3023,origin=`http://localhost:${port}`;
await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(new Error(`Test port ${port} is occupied; no process was stopped`)));probe.listen(port,'::',()=>probe.close(resolve));});
const database='sentinel_test';
const admin=new Pool({connectionString:`postgres://sentinel_admin:${encodeURIComponent(process.env.SENTINEL_DATABASE_ADMIN_PASSWORD)}@127.0.0.1:55441/sentinel`,connectionTimeoutMillis:5000});
try{if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)await admin.query('CREATE DATABASE sentinel_test');}finally{await admin.end();}
function run(command,args,env){return new Promise((resolve,reject)=>{const child=spawn(command,args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command} failed (${code})`)));});}
const runtime=`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD)}@127.0.0.1:55441/${database}`;
const env={...process.env,DATABASE_URL:`postgres://sentinel_admin:${encodeURIComponent(process.env.SENTINEL_DATABASE_ADMIN_PASSWORD)}@127.0.0.1:55441/${database}`};
await run(process.execPath,['--import','tsx','packages/db/src/migrate.ts'],env);
await run(process.execPath,['--import','tsx','packages/db/src/provision.ts'],env);
Object.assign(env,{DATABASE_URL:runtime,TEST_DATABASE_URL:runtime,TEST_CONSOLE_URL:origin,SENTINEL_PUBLIC_URL:origin,OIDC_ISSUER:'https://identity.example',OIDC_CLIENT_ID:'test',OIDC_CLIENT_SECRET:'test-only',SENTINEL_ISOLATED_TEST_BUILD:'true',SENTINEL_CONNECTOR_KEY_FILE:process.cwd()+'/.local/connector-key'});
delete env.SENTINEL_LOCAL_OIDC_INTERNAL_URL;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','apps/console','--webpack','--port',String(port)],{env,stdio:'inherit'});
try{
 const deadline=Date.now()+90000;let ready=false;
 while(Date.now()<deadline){
  if(server.exitCode!==null)throw new Error('Test console exited before readiness');
  try{ready=(await fetch(origin+'/api/workspaces',{signal:AbortSignal.timeout(2000)})).status===401;if(ready)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(!ready)throw new Error('Test console readiness timed out');
 await run('npx',['vitest','run','packages/db/src/connectors.test.ts','packages/db/src/investigations.test.ts','packages/db/src/notifications.test.ts','packages/db/src/github-sync.test.ts','apps/console/tests/connectors.http.test.ts','apps/worker-read/src/connector-tests.test.ts','apps/worker-read/src/bound-activities.test.ts','apps/worker-read/src/run-dispatch.test.ts','apps/worker-read/src/github-sync.test.ts','apps/worker-communication/src/processor.test.ts'],env);
 console.log('Local connector database, HTTP authorization and queued capability checks passed. Hosted publishing and full telemetry acceptance are separate gates.');
}finally{
 server.kill('SIGTERM');
 await new Promise(resolve=>{if(server.exitCode!==null)return resolve();const timer=setTimeout(()=>{server.kill('SIGKILL');resolve();},5000);server.once('exit',()=>{clearTimeout(timer);resolve();});});
}
