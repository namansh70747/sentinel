import { execFileSync } from 'node:child_process';
import { access, stat } from 'node:fs/promises';

const checks=[];
checks.push({name:'Node >=22',ok:Number(process.versions.node.split('.')[0])>=22,detail:process.versions.node});
for(const [name,args] of [['Docker',['version','--format','{{.Server.Version}}']],['Compose',['compose','version','--short']]]) {
 try { checks.push({name,ok:true,detail:execFileSync('docker',args,{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim()}); }
 catch { checks.push({name,ok:false,detail:'Unavailable'}); }
}
try { await access('.local/compose.env');const info=await stat('.local/compose.env');checks.push({name:'Local Compose inputs',ok:(info.mode&0o077)===0,detail:(info.mode&0o077)===0?'Prepared with private permissions':'Run chmod 600 .local/compose.env'}); }
catch { checks.push({name:'Local Compose inputs',ok:false,detail:'Run npm run dev:prepare'}); }
for(const check of checks)console.log(`${check.ok?'PASS':'FAIL'} ${check.name}: ${check.detail}`);
if(checks.some(check=>!check.ok))process.exitCode=1;
