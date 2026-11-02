import 'server-only';
import { cookies } from 'next/headers';
import { SentinelDatabase } from '@sentinel/db';
import { SentinelAuth } from '@sentinel/auth';
let auth: SentinelAuth | undefined;
let database: SentinelDatabase | undefined;
export function getDatabase() {
 if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
 return database ??= new SentinelDatabase(process.env.DATABASE_URL);
}
export function getAuth() {
 const { DATABASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, SENTINEL_PUBLIC_URL } = process.env;
 if (!DATABASE_URL || !OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET || !SENTINEL_PUBLIC_URL) return null;
 return auth ??= new SentinelAuth(getDatabase(), { issuer: OIDC_ISSUER, clientId: OIDC_CLIENT_ID, clientSecret: OIDC_CLIENT_SECRET, redirectUri: new URL('/api/auth/callback',SENTINEL_PUBLIC_URL).href });
}
export async function currentIdentity() {
 const provider = getAuth();
 if (!provider) return null;
 return provider.session((await cookies()).get('sentinel_session')?.value);
}
export function secureCookie() { return process.env.SENTINEL_PUBLIC_URL?.startsWith('https:') ?? false; }
