import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
try { loadEnvFile('.env'); } catch (error) { if(error.code !== 'ENOENT') throw error; }
const directory = new URL('../../.local/keycloak/',import.meta.url);
let previous;
try { previous = JSON.parse(await readFile(new URL('realm.json',directory),'utf8')); } catch(error) { if(error.code !== 'ENOENT') throw error; }
const secret = previous?.clients?.[0]?.secret || process.env.OIDC_CLIENT_SECRET || randomBytes(32).toString('base64url');
const password = process.env.SENTINEL_LOCAL_OPERATOR_PASSWORD || previous?.users?.[0]?.credentials?.[0]?.value || randomBytes(24).toString('base64url');
const origin = new URL(process.env.SENTINEL_PUBLIC_URL || 'http://localhost:3010');
if(origin.protocol !== 'http:' || origin.hostname !== 'localhost' || origin.pathname !== '/' || origin.username || origin.password) throw new Error('Local Keycloak requires an http://localhost origin');
await mkdir(directory,{recursive:true,mode:0o700});
const realm = {realm:'sentinel',enabled:true,clients:[{clientId:'sentinel',enabled:true,protocol:'openid-connect',publicClient:false,secret,standardFlowEnabled:true,directAccessGrantsEnabled:false,redirectUris:[new URL('/api/auth/callback',origin).href],webOrigins:[origin.origin],attributes:{'pkce.code.challenge.method':'S256'}}],users:[{username:'operator',enabled:true,firstName:'Local',lastName:'Operator',email:'operator@sentinel.example',emailVerified:true,credentials:[{type:'password',value:password,temporary:false}]}]};
// Import is additive for a new local realm; never reset an existing user's
// identity or password while preparing files for another startup.
realm.users=previous?.users??realm.users;
let owner=realm.users.find(user=>user.username==='namsh70747@gmail.com');
if(!owner){owner={id:randomUUID(),username:'namsh70747@gmail.com',enabled:true,email:'namsh70747@gmail.com',emailVerified:true,firstName:'Local',lastName:'Owner',credentials:[{type:'password',value:randomBytes(24).toString('base64url'),temporary:false}]};realm.users.push(owner);}
owner.id??=randomUUID();
let workspaceId;
try{workspaceId=(JSON.parse(await readFile(new URL('../owner.json',directory),'utf8'))).workspaceId;}catch(error){if(error.code!=='ENOENT')throw error;}
workspaceId??=randomUUID();
await writeFile(new URL('../owner.json',directory),JSON.stringify({email:owner.email,subject:owner.id,issuer:'http://localhost:8088/realms/sentinel',workspaceId},null,2),{mode:0o600});
await writeFile(new URL('owner-password',directory),owner.credentials[0].value+'\n',{mode:0o600});
// The parent directory stays private; the single-file bind must be readable by Keycloak's container UID.
await writeFile(new URL('realm.json',directory),JSON.stringify(realm,null,2),{mode:0o644});
await writeFile(new URL('operator-password',directory),password+'\n',{mode:0o600});
await writeFile(new URL('oidc.env',directory),`OIDC_ISSUER=http://localhost:8088/realms/sentinel\nOIDC_CLIENT_ID=sentinel\nOIDC_CLIENT_SECRET=${secret}\nSENTINEL_ALLOW_LOCAL_OIDC_HTTP=true\nSENTINEL_PUBLIC_URL=${origin.origin}\n`,{mode:0o600});
console.log('Generated ignored .local/keycloak realm, operator-password and oidc.env files. Existing generated credentials are preserved unless environment values override them. Keep these files local.');
