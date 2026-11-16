const ALLOWED = new Set(['http:', 'https:']);
export function assertAllowed(raw: string, allowlist = process.env.SENTINEL_EGRESS_ALLOWLIST || '127.0.0.1,localhost') {
 const url = new URL(raw);
 if (!ALLOWED.has(url.protocol) || url.username || url.password) throw new Error('Egress URL is not allowed');
 const hosts = allowlist.split(',').map(item => item.trim()).filter(Boolean);
 if (!hosts.includes(url.hostname)) throw new Error('Egress host is not allowlisted');
 return url;
}
