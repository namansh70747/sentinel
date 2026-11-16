export function simulateCost(accountId: string) {
 if (accountId !== '000000000000') throw new Error('Simulated cost accepts only the fictional account');
 return { provenance: 'simulated' as const, currency: 'USD', dailyTotal: 0, note: 'This number is not a bill.' };
}
