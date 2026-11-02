import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
try{loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}catch(error){if(error.code!=='ENOENT')throw error;}
const require=createRequire(import.meta.url);
const command=process.argv[2];
const entrypoints={api:'apps/api/src/main.ts',demo:'apps/api/src/main.ts',worker:'apps/worker-read/src/main.ts',migrate:'packages/db/src/migrate.ts',provision:'packages/db/src/provision.ts'};
let args,cwd=root;
if(command==='console'){args=[require.resolve('next/dist/bin/next'),process.argv[3]??'dev','--port','3010'];cwd=fileURLToPath(new URL('../apps/console/',import.meta.url));}
else if(entrypoints[command])args=['--import','tsx',entrypoints[command]];
else throw new Error('Unknown Sentinel runtime command');
const env={...process.env};
if(command==='demo'){env.SENTINEL_DEMO='true';env.SENTINEL_PORT='8790';}
if(command==='api')env.SENTINEL_DEMO='false';
const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
