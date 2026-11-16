const ACCOUNT = '000000000000';
export function simulateCloudWatch(accountId: string) {
 if (accountId !== ACCOUNT) throw new Error('Simulated CloudWatch accepts only the fictional account');
 return { provenance: 'simulated' as const, alarms: [{ name: 'checkout-synthetic', state: 'ALARM', accountId }] };
}
