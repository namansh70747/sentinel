import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as oidc from 'openid-client';
import type { SentinelDatabase } from '@sentinel/db';
export interface AuthConfig { issuer: string; clientId: string; clientSecret: string; redirectUri: string }
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('base64url');
export class SentinelAuth {
 private configuration?: Promise<oidc.Configuration>;
 constructor(private readonly db: SentinelDatabase, private readonly config: AuthConfig) {
  if (new URL(config.issuer).protocol !== 'https:') throw new Error('OIDC issuer must use HTTPS');
  const redirect = new URL(config.redirectUri);
  if (redirect.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(redirect.hostname)) throw new Error('Non-local callback must use HTTPS');
 }
 private client() {
  return this.configuration ??= oidc.discovery(new URL(this.config.issuer), this.config.clientId, this.config.clientSecret);
 }
 async begin() {
  const config = await this.client();
  const browserToken = token(), verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
  await this.db.pool.query("INSERT INTO login_transactions(token_hash,verifier,nonce,state,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')", [hash(browserToken),verifier,nonce,state]);
  const url = oidc.buildAuthorizationUrl(config, { redirect_uri: this.config.redirectUri, scope: 'openid email profile', state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' });
  return { browserToken, url: url.href };
 }
 async complete(browserToken: string, callback: URL) {
  if (callback.origin !== new URL(this.config.redirectUri).origin || callback.pathname !== new URL(this.config.redirectUri).pathname) throw new Error('Invalid callback');
  const transaction = await this.db.pool.query('DELETE FROM login_transactions WHERE token_hash=$1 AND expires_at>now() RETURNING *',[hash(browserToken)]);
  if (!transaction.rowCount) throw new Error('Login transaction expired or already used');
  const tx = transaction.rows[0];
  const tokens = await oidc.authorizationCodeGrant(await this.client(), callback, { pkceCodeVerifier: tx.verifier, expectedState: tx.state, expectedNonce: tx.nonce, idTokenExpected: true });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error('Missing identity');
  const result = await this.db.pool.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3) ON CONFLICT(issuer,subject) DO UPDATE SET subject=EXCLUDED.subject RETURNING id',[randomUUID(),claims.iss,claims.sub]);
  const sessionToken = token();
  await this.db.pool.query("INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [hash(sessionToken),result.rows[0].id]);
  return sessionToken;
 }
 async session(rawToken: string | undefined) {
  if (!rawToken || rawToken.length > 256) return null;
  const result = await this.db.pool.query('SELECT i.id,i.issuer,i.subject,s.created_at AS authenticated_at FROM sessions s JOIN identities i ON i.id=s.identity_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash(rawToken)]);
  return result.rows[0] as { id: string; issuer: string; subject: string; authenticated_at: Date } | undefined ?? null;
 }
 async revoke(rawToken: string) { await this.db.pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(rawToken)]); }
 async memberships(identityId: string) {
  return (await this.db.pool.query('SELECT m.workspace_id,m.role,w.name FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.identity_id=$1',[identityId])).rows;
 }
}

export { PasskeyEnrollment } from "./passkeys";
