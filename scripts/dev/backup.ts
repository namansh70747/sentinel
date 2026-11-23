import { loadEnvFile } from 'node:process';
import { constants } from 'node:fs';
import { open,mkdir,writeFile,readFile,rename } from 'node:fs/promises';
import { resolve,basename } from 'node:path';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { sealBackup,openBackup } from '../../packages/db/src/backup-archive';
import { withRecoveryDatabase } from '../../packages/db/src/recovery-target';
import { SecretVault } from '@sentinel/connectors/secrets';

const tables=['workspaces','identities','workspace_memberships','services','connector_instances','connector_versions','service_connector_bindings','incidents','incident_evidence','investigation_runs','investigation_evidence','notification_subscriptions','notification_deliveries','runbooks','runbook_versions','mcp_access_tokens'] as const;
interface Payload {version:1;createdAt:string;postgresVersion:string;counts:Record<string,string>;dump:string;dumpHash:string;connectorKey:string}
const sha=(buffer:Buffer)=>createHash('sha256').update(buffer).digest('hex');
loadEnvFile('.local/compose.env');
const adminUrl=(database:string)=>`postgres://sentinel_admin:${encodeURIComponent(process.env.SENTINEL_DATABASE_ADMIN_PASSWORD!)}@127.0.0.1:55441/${database}`;
const compose=['compose','--env-file','.local/compose.env','-p','sentinel','-f','compose.durable.yml','-f','compose.observe.yml','-f','compose.local.yml','exec','-T','postgres'];
function databaseCommand(args:string[],input?:Buffer){return new Promise<Buffer>((resolveResult,reject)=>{
 const child=spawn('docker',[...compose,...args],{stdio:['pipe','pipe','pipe']}),chunks:Buffer[]=[];let size=0,failed=false;
 const fail=(error:Error)=>{if(failed)return;failed=true;child.kill('SIGKILL');reject(error);};
 const timer=setTimeout(()=>fail(new Error('Database backup/restore command exceeded 60 seconds')),60000);
 child.stdout.on('data',chunk=>{size+=chunk.length;if(size>64*1024*1024)fail(new Error('Local backup exceeds 64 MiB. Use a streaming managed backup for a larger database.'));else chunks.push(chunk);});
 child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',()=>{clearTimeout(timer);fail(new Error('Docker database command could not start'));});
 child.on('close',code=>{clearTimeout(timer);if(!failed){if(code===0)resolveResult(Buffer.concat(chunks));else reject(new Error('Docker database command failed; source database was not modified.'));}});
 child.stdin.end(input);
 });}
async function privateFile(path:string,maxBytes:number){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await file.stat();if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>maxBytes||process.getuid&&stat.uid!==process.getuid())throw new Error('Private regular backup files required');return await file.readFile();}finally{await file.close();}
}
async function recoveryKey(create:boolean){
 const path=resolve('.local/backup-recovery-key');
 try{const key=await privateFile(path,32);if(key.length!==32)throw new Error('Invalid backup recovery key');return key;}catch(error){if(!create||(error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const key=randomBytes(32);await writeFile(path,key,{mode:0o600,flag:'wx'});return key;
}
async function counts(pool:Pick<Pool,'query'>){const result:Record<string,string>={};for(const table of tables)result[table]=(await pool.query(`SELECT count(*)::text AS count FROM ${table}`)).rows[0].count;return result;}

async function backup(){
 const pool=new Pool({connectionString:adminUrl('sentinel'),connectionTimeoutMillis:5000}),client=await pool.connect();
 try{
  const key=await recoveryKey(true),connectorKey=await privateFile('.local/connector-key',32);if(connectorKey.length!==32)throw new Error('Invalid connector key');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const manifest=await counts(client as unknown as Pick<Pool,'query'>),postgresVersion=(await client.query('SHOW server_version')).rows[0].server_version;
  const dump=await databaseCommand(['pg_dump','-U','sentinel_admin','--dbname=sentinel','--format=custom',`--snapshot=${snapshot}`]);
  await client.query('COMMIT');
  const payload:Payload={version:1,createdAt:new Date().toISOString(),postgresVersion,counts:manifest,dump:dump.toString('base64'),dumpHash:sha(dump),connectorKey:connectorKey.toString('base64')};
  const directory=resolve('.local/backups');await mkdir(directory,{recursive:true,mode:0o700});
  const name=`backup-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.sentinel`;
  await writeFile(resolve(directory,name),sealBackup(Buffer.from(JSON.stringify(payload)),key),{mode:0o600,flag:'wx'});
  const latestTemporary=resolve(directory,`latest-${randomUUID()}.tmp`);
  await writeFile(latestTemporary,JSON.stringify({file:name,createdAt:payload.createdAt,postgresVersion})+'\n',{mode:0o600,flag:'wx'});
  await rename(latestTemporary,resolve(directory,'latest.json'));
  console.log(`Encrypted local backup saved: .local/backups/${name}`);
  console.log('Store .local/backup-recovery-key separately from the encrypted archive. The matching connector key is inside the archive.');
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();await pool.end();}
}
async function testRecovery(){
 const requested=process.argv[3]??JSON.parse(await readFile('.local/backups/latest.json','utf8')).file;
 if(typeof requested!=='string'||basename(requested)!==requested||!/^backup-[a-zA-Z0-9.-]+\.sentinel$/.test(requested))throw new Error('Select an archive filename inside .local/backups.');
 const archive=await privateFile(resolve('.local/backups',requested),128*1024*1024+100),key=await recoveryKey(false);
 const payload=JSON.parse(openBackup(archive,key).toString('utf8')) as Payload;
 if(payload.version!==1||typeof payload.dump!=='string'||typeof payload.connectorKey!=='string'||!payload.counts)throw new Error('Invalid backup manifest');
 const dump=Buffer.from(payload.dump,'base64'),connectorKey=Buffer.from(payload.connectorKey,'base64');
 if(sha(dump)!==payload.dumpHash||connectorKey.length!==32)throw new Error('Backup payload failed integrity validation');
 const admin=new Pool({connectionString:adminUrl('sentinel'),connectionTimeoutMillis:5000,statement_timeout:10000});
 try{
  const result=await withRecoveryDatabase(sql=>admin.query(sql),async database=>{
   await databaseCommand(['pg_restore','-U','sentinel_admin',`--dbname=${database}`,'--exit-on-error','--no-owner'],dump);
   const restored=new Pool({connectionString:adminUrl(database),connectionTimeoutMillis:5000,statement_timeout:10000});
   try{
    const restoredCounts=await counts(restored);for(const table of tables)if(restoredCounts[table]!==payload.counts[table])throw new Error(`Recovery record count mismatch: ${table}`);
    const secrets=(await restored.query('SELECT workspace_id,id AS connector_id,secret_envelope FROM connector_instances WHERE secret_envelope IS NOT NULL UNION ALL SELECT workspace_id,connector_id,secret_envelope FROM connector_versions WHERE secret_envelope IS NOT NULL LIMIT 10001')).rows;
    if(secrets.length>10000)throw new Error('Recovery secret verification exceeds the local 10,000-envelope limit');
    const vault=new SecretVault(connectorKey);for(const row of secrets)vault.open(row.workspace_id,row.connector_id,row.secret_envelope);
    return {recovery:'passed',postgresVersion:payload.postgresVersion,tablesCompared:tables.length,credentialEnvelopesDecrypted:secrets.length,sourceDatabaseModified:false};
   }finally{await restored.end();}
  });
  console.log(JSON.stringify(result));
 }finally{await admin.end();}
}
try{if(process.argv[2]==='create')await backup();else if(process.argv[2]==='test')await testRecovery();else throw new Error('Use create or test');}catch(error){console.error(error instanceof Error?error.message:'Local backup/recovery failed');process.exitCode=1;}
