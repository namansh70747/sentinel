import type { CustomFetch } from 'openid-client';

/** Transport-only rewrite. Discovery metadata and JWT issuer claims remain public. */
export function localOidcTransport(issuer: string, internalOrigin: string, transport: typeof fetch = fetch): CustomFetch {
 const publicUrl = new URL(issuer), internal = new URL(internalOrigin);
 if (publicUrl.origin !== 'http://localhost:8088' || publicUrl.pathname !== '/realms/sentinel' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password || internal.href !== 'http://keycloak:8080/') {
  throw new Error('Local OIDC transport requires the dedicated Sentinel Keycloak origins');
 }
 return async (input, options) => {
  const url = new URL(input);
  if (url.origin !== publicUrl.origin || !url.pathname.startsWith('/realms/sentinel/') || url.username || url.password || url.hash) throw new Error('OIDC endpoint outside the local realm');
  url.host = internal.host;
  // openid-client also accepts generic Uint8Array bodies; copy to an owned
  // ArrayBuffer to satisfy the browser and Node Fetch BodyInit definitions.
  const body = options.body instanceof Uint8Array ? new Uint8Array(options.body).buffer : options.body;
  return transport(url, { ...options, body, redirect: 'error' });
 };
}
