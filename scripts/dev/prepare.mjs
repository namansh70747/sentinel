import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

for (const file of ['.env','.local/compose.env']) {
 try { loadEnvFile(file); } catch(error) { if(error.code !== 'ENOENT') throw error; }
}
await mkdir('.local',{recursive:true,mode:0o700});
try{const key=await readFile('.local/connector-key');if(key.length!==32)throw new Error('Existing connector key is invalid; restore its backup rather than rotating it');}
catch(error){if(error.code!=='ENOENT')throw error;await writeFile('.local/connector-key',randomBytes(32),{flag:'wx',mode:0o600});}
const keys=['SENTINEL_DATABASE_ADMIN_PASSWORD','SENTINEL_DATABASE_PASSWORD','GF_SECURITY_ADMIN_PASSWORD','KEYCLOAK_OPERATOR_PASSWORD'];
for(const key of keys) process.env[key] ||= randomBytes(32).toString('base64url');
const optional=['SENTINEL_CONFIG_WORKSPACE_ID','SENTINEL_GRAFANA_ENDPOINT_ID','SENTINEL_WEBHOOK_SECRET'];
const prepared=[...keys,...optional].filter(key=>process.env[key]).map(key=>`${key}=${JSON.stringify(process.env[key])}`);
const result=spawnSync(process.execPath,['scripts/dev/prepare-keycloak.mjs'],{env:{...process.env,SENTINEL_PUBLIC_URL:'http://localhost:3010'},stdio:'inherit'});
if(result.status!==0)process.exitCode=result.status??1;
else{
 const realm=JSON.parse(await readFile('.local/keycloak/realm.json','utf8'));
 prepared.push('SENTINEL_CONNECTOR_KEY_FILE="/run/secrets/connector_key"','OIDC_ISSUER="http://localhost:8088/realms/sentinel"','OIDC_CLIENT_ID="sentinel"',`OIDC_CLIENT_SECRET=${JSON.stringify(realm.clients[0].secret)}`,'SENTINEL_ALLOW_LOCAL_OIDC_HTTP="true"','SENTINEL_LOCAL_OIDC_INTERNAL_URL="http://keycloak:8080"','SENTINEL_PUBLIC_URL="http://localhost:3010"');
 await writeFile('.local/compose.env',prepared.join('\n')+'\n',{mode:0o600});
 console.log('Local Compose inputs and private connector encryption key prepared. Existing values are preserved.');
}
