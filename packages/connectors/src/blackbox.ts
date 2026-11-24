export function interpretProbe(success: number | null, certExpiryUnix: number | null, nowUnix: number) {
 if (success === null || !Number.isFinite(nowUnix)) return { outcome: 'unavailable' as const, certificateDays: null };
 const certificateDays = certExpiryUnix === null ? null : Math.floor((certExpiryUnix - nowUnix) / 86400);
 return { outcome: success === 1 ? 'ok' as const : 'failed' as const, certificateDays };
}
