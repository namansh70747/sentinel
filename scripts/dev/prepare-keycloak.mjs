import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
try { loadEnvFile('.env'); } catch (error) { if(error.code !== 'ENOENT') throw error; }
const directory = new URL('../../.local/keycloak/',import.meta.url);
let previous;
try { previous = JSON.parse(await readFile(new URL('realm.json',directory),'utf8')); } catch(error) { if(error.code !== 'ENOENT') throw error; }
const secret = process.env.OIDC_CLIENT_SECRET || previous?.clients?.[0]?.secret || randomBytes(32).toString('base64url');
const password = process.env.SENTINEL_LOCAL_OPERATOR_PASSWORD || previous?.users?.[0]?.credentials?.[0]?.value || randomBytes(24).toString('base64url');
const origin = new URL(process.env.SENTINEL_PUBLIC_URL || 'http://localhost:3010');
if(origin.protocol !== 'http:' || origin.hostname !== 'localhost' || origin.pathname !== '/' || origin.username || origin.password) throw new Error('Local Keycloak requires an http://localhost origin');
await mkdir(directory,{recursive:true,mode:0o700});
const realm = {realm:'sentinel',enabled:true,clients:[{clientId:'sentinel',enabled:true,protocol:'openid-connect',publicClient:false,secret,standardFlowEnabled:true,directAccessGrantsEnabled:false,redirectUris:[new URL('/api/auth/callback',origin).href],webOrigins:[origin.origin],attributes:{'pkce.code.challenge.method':'S256'}}],users:[{username:'operator',enabled:true,firstName:'Local',lastName:'Operator',email:'operator@sentinel.example',emailVerified:true,credentials:[{type:'password',value:password,temporary:false}]}]};
// The parent directory stays private; the single-file bind must be readable by Keycloak's container UID.
await writeFile(new URL('realm.json',directory),JSON.stringify(realm,null,2),{mode:0o644});
await writeFile(new URL('operator-password',directory),password+'\n',{mode:0o600});
await writeFile(new URL('oidc.env',directory),`OIDC_ISSUER=http://localhost:8088/realms/sentinel\nOIDC_CLIENT_ID=sentinel\nOIDC_CLIENT_SECRET=${secret}\nSENTINEL_ALLOW_LOCAL_OIDC_HTTP=true\nSENTINEL_PUBLIC_URL=${origin.origin}\n`,{mode:0o600});
console.log('Generated ignored .local/keycloak realm, operator-password and oidc.env files. Existing generated credentials are preserved unless environment values override them. Keep these files local.');
