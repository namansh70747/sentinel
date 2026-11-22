import { execFileSync } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';

const checks=[];
checks.push({name:'Node >=22',ok:Number(process.versions.node.split('.')[0])>=22,detail:process.versions.node});
for(const [name,args] of [['Docker',['version','--format','{{.Server.Version}}']],['Compose',['compose','version','--short']]]) {
 try { checks.push({name,ok:true,detail:execFileSync('docker',args,{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim()}); }
 catch { checks.push({name,ok:false,detail:'Unavailable'}); }
}
try { await access('.local/compose.env');const info=await stat('.local/compose.env');checks.push({name:'Local Compose inputs',ok:(info.mode&0o077)===0,detail:(info.mode&0o077)===0?'Prepared with private permissions':'Run chmod 600 .local/compose.env'}); }
catch { checks.push({name:'Local Compose inputs',ok:false,detail:'Run npm run dev:prepare'}); }
try{loadEnvFile('.local/compose.env');}catch{}
try{const key=await stat('.local/connector-key');checks.push({name:'Connector encryption key',ok:key.size===32&&(key.mode&0o077)===0,detail:key.size===32&&(key.mode&0o077)===0?'Private 32-byte key present':'Restore the private key; do not rotate it against existing data'});}catch{checks.push({name:'Connector encryption key',ok:false,detail:'Run npm run dev:prepare'});}
let ownedPorts=new Set();
try{
 const rows=execFileSync('docker',['ps','--filter','label=com.docker.compose.project=sentinel','--format','{{json .}}'],{encoding:'utf8',timeout:10000}).trim();
 for(const line of rows.split('\n').filter(Boolean)){const row=JSON.parse(line);for(const match of row.Ports.matchAll(/127\.0\.0\.1:(\d+)->/g))ownedPorts.add(Number(match[1]));}
 const bytes=Number(execFileSync('docker',['info','--format','{{.MemTotal}}'],{encoding:'utf8',timeout:10000}));
 const gib=bytes/1024**3;
 checks.push({name:'Core Docker memory budget',ok:gib>=6,detail:`${gib.toFixed(1)} GiB allocated; core requires at least 6 GiB. Optional profiles require separate budgets.`});
}catch{}
if(ownedPorts.has(55441)){
 for(const [label,user,key] of [['Admin database credential','sentinel_admin','SENTINEL_DATABASE_ADMIN_PASSWORD'],['Runtime database credential','sentinel_app','SENTINEL_DATABASE_PASSWORD']]){
  const pool=new Pool({host:'127.0.0.1',port:55441,database:'sentinel',user,password:process.env[key],connectionTimeoutMillis:3000,statement_timeout:3000});
  try{const row=(await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];const safe=user!=='sentinel_app'||(!row.rolsuper&&!row.rolbypassrls);checks.push({name:label,ok:safe,detail:safe?'Authentication verified':'Runtime role must not bypass tenant policies'});}catch{checks.push({name:label,ok:false,detail:'Saved credential does not authenticate; preserve the volume and restore its matching credentials'});}finally{await pool.end();}
 }
}
for(const port of [3010,3012,8088,55441,7233,8233,9090,3100,3200,12345,8091,9464]){
 if(ownedPorts.has(port))continue;
 const free=await new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
 checks.push({name:`Port ${port}`,ok:free,detail:free?'Available':'In use outside the Sentinel Compose project; preserve it and resolve the conflict before dev:up'});
}
for(const check of checks)console.log(`${check.ok?'PASS':'FAIL'} ${check.name}: ${check.detail}`);
if(checks.some(check=>!check.ok))process.exitCode=1;
