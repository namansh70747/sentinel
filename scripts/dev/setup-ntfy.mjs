import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
loadEnvFile('.local/compose.env');
const topic=process.env.NTFY_TOPIC||'sentinel-local-alerts';
if(!/^[a-zA-Z0-9_-]{16,128}$/.test(topic))throw new Error('Invalid local notification topic');
await mkdir('.local/ntfy',{recursive:true,mode:0o700});
let password;
try{password=(await readFile('.local/ntfy/password','utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;password=randomBytes(32).toString('base64url');await writeFile('.local/ntfy/password',password+'\n',{flag:'wx',mode:0o600});}
const compose=['compose','--env-file','.local/compose.env','-p','sentinel','-f','compose.observe.yml'];
function run(args,env=process.env){return execFileSync('docker',[...compose,'exec','-T',...args],{encoding:'utf8',env,timeout:15000,stdio:['ignore','pipe','pipe']});}
const deadline=Date.now()+30000;let ready=false;
while(Date.now()<deadline){try{ready=(await fetch('http://127.0.0.1:8091/v1/health',{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
if(!ready)throw new Error('Local ntfy is not ready');
try{
 run(['-e','NTFY_PASSWORD','ntfy','ntfy','user','add','--ignore-exists','sentinel'],{...process.env,NTFY_PASSWORD:password});
 run(['ntfy','ntfy','access','sentinel',topic,'rw']);
 let token;
 try{token=(await readFile('.local/ntfy/token','utf8')).trim();}
 catch(error){if(error.code!=='ENOENT')throw error;const output=run(['ntfy','ntfy','token','add','--label','sentinel-local','sentinel']);token=output.match(/tk_[A-Za-z0-9]+/)?.[0];if(!token)throw new Error('Token creation returned no token');await writeFile('.local/ntfy/token',token+'\n',{flag:'wx',mode:0o600});}
 const anonymous=await fetch(`http://127.0.0.1:8091/${topic}/json?poll=1`,{signal:AbortSignal.timeout(3000)});
 if(![401,403].includes(anonymous.status))throw new Error('Anonymous subscription is unexpectedly permitted');
 const anonymousPublish=await fetch(`http://127.0.0.1:8091/${topic}`,{method:'POST',body:'Sentinel anonymous-access denial probe',signal:AbortSignal.timeout(3000)});
 if(![401,403].includes(anonymousPublish.status))throw new Error('Anonymous publishing is unexpectedly permitted');
 const authenticated=await fetch(`http://127.0.0.1:8091/${topic}/json?poll=1`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(3000)});
 if(!authenticated.ok)throw new Error('Saved token does not match the local ntfy database; restore its matching volume/token');
 await writeFile('.local/ntfy/connection.json',JSON.stringify({endpoint:'http://ntfy:80',topic,username:'sentinel',tokenFile:'.local/ntfy/token'},null,2),{mode:0o600});
 console.log('Local ntfy user, topic ACL and private token ensured. Anonymous subscription denied; authenticated subscription verified. Token: .local/ntfy/token');
}catch{throw new Error('Local ntfy authentication setup failed. Existing credentials were preserved; inspect the local service configuration.');}
