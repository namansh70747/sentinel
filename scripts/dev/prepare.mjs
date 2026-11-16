import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

for (const file of ['.env','.local/compose.env']) {
 try { loadEnvFile(file); } catch(error) { if(error.code !== 'ENOENT') throw error; }
}
await mkdir('.local',{recursive:true,mode:0o700});
const keys=['SENTINEL_DATABASE_ADMIN_PASSWORD','SENTINEL_DATABASE_PASSWORD','GF_SECURITY_ADMIN_PASSWORD','KEYCLOAK_OPERATOR_PASSWORD'];
for(const key of keys) process.env[key] ||= randomBytes(32).toString('base64url');
const optional=['SENTINEL_CONFIG_WORKSPACE_ID','SENTINEL_GRAFANA_ENDPOINT_ID','SENTINEL_WEBHOOK_SECRET'];
await writeFile('.local/compose.env',[...keys,...optional].filter(key=>process.env[key]).map(key=>`${key}=${JSON.stringify(process.env[key])}`).join('\n')+'\n',{mode:0o600});
const result=spawnSync(process.execPath,['scripts/dev/prepare-keycloak.mjs'],{env:{...process.env,SENTINEL_PUBLIC_URL:'http://localhost:3010'},stdio:'inherit'});
if(result.status!==0)process.exitCode=result.status??1;
else console.log('Local Compose inputs prepared in ignored .local/compose.env. Existing values are preserved.');
