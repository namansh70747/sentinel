import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const action=process.argv[2];
const base=['compose','--env-file','.local/compose.env','-p','sentinel','-f','compose.durable.yml','-f','compose.observe.yml','-f','compose.local.yml'];
const commands={up:['up','-d','--build'],status:['ps','--all'],stop:['stop']};
if(!(action in commands))throw new Error('Use up, status or stop');
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
if(action==='up'){
 run(process.execPath,['scripts/dev/prepare.mjs']);
 run(process.execPath,['scripts/dev/doctor.mjs']);
}
run('docker',[...base,...commands[action]]);
if(action==='up'){
 run(process.execPath,['--import','tsx','scripts/dev/bootstrap-owner.ts']);
 run(process.execPath,['scripts/dev/wait.mjs','--core']);
}
