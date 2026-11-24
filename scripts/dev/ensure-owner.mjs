import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
try { loadEnvFile('.local/compose.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const email = process.env.SENTINEL_OWNER_EMAIL || 'nsharma_be24@thapar.edu';
const realm = JSON.parse(await readFile('.local/keycloak/realm.json', 'utf8'));
const owner = realm.users.find(user => user.username === email);
if (!owner?.id || !owner.credentials?.[0]?.value) throw new Error('Run dev:prepare-auth before ensuring the local owner');
const password = owner.credentials[0].value;
const adminPassword = process.env.KEYCLOAK_OPERATOR_PASSWORD;
if (!adminPassword) throw new Error('KEYCLOAK_OPERATOR_PASSWORD is missing from .local/compose.env');
const base = 'http://localhost:8088';
const tokenResponse = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
 method: 'POST',
 headers: { 'content-type': 'application/x-www-form-urlencoded' },
 body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: adminPassword }),
});
if (!tokenResponse.ok) throw new Error(`Keycloak admin login failed (${tokenResponse.status}). Start the local stack, then retry. The owner password was not printed.`);
const { access_token: token } = await tokenResponse.json();
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const existing = await fetch(`${base}/admin/realms/sentinel/users?username=${encodeURIComponent(email)}&exact=true`, { headers });
if (!existing.ok) throw new Error(`Keycloak user lookup failed (${existing.status})`);
const found = await existing.json();
const createdNow = found.length === 0;
if (createdNow) {
 const created = await fetch(`${base}/admin/realms/sentinel/users`, {
  method: 'POST', headers, body: JSON.stringify({ id: owner.id, username: email, email, emailVerified: true, enabled: true, firstName: 'Naman', lastName: 'Sharma', credentials: [{ type: 'password', value: password, temporary: false }] }),
 });
 if (created.status !== 201) throw new Error(`Keycloak user create failed (${created.status}). Existing users were not modified.`);
}
const confirmed = await (await fetch(`${base}/admin/realms/sentinel/users?username=${encodeURIComponent(email)}&exact=true`, { headers })).json();
const subject = confirmed[0]?.id;
if (!subject) throw new Error('Local owner was not visible after ensure');
let workspaceId;
try { workspaceId = JSON.parse(await readFile('.local/owner.json', 'utf8')).workspaceId; } catch (error) { if (error.code !== 'ENOENT') throw error; }
workspaceId ??= owner.id;
await writeFile('.local/owner.json', JSON.stringify({ email, subject, issuer: 'http://localhost:8088/realms/sentinel', workspaceId }, null, 2), { mode: 0o600 });
if (createdNow) await writeFile('.local/keycloak/owner-password', `${password}\n`, { mode: 0o600 });
console.log(createdNow ? `Local owner ${email} created. Password file: .local/keycloak/owner-password` : `Local owner ${email} already existed. Password was left unchanged.`);
