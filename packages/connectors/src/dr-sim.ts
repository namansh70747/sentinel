export function simulateDr(accountId: string) {
 if (accountId !== '000000000000') throw new Error('Simulated disaster recovery accepts only the fictional account');
 return { provenance: 'simulated' as const, backupStatus: 'unknown', note: 'Restore was not attempted.' };
}
