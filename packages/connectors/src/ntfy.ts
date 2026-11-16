import { assertAllowed } from './egress';
export async function publishNtfy(baseUrl: string, topic: string, body: string) {
 if (!/^[A-Za-z0-9_-]{16,128}$/.test(topic)) throw new Error('Invalid ntfy topic');
 const url = assertAllowed(`${baseUrl.replace(/\/$/, '')}/${topic}`);
 const response = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(5000), redirect: 'error' });
 if (!response.ok) throw new Error(`ntfy request failed (${response.status})`);
}
