export const SIMULATED_ACCOUNT = '000000000000';
export const SIMULATED_SERVICE_ARN = 'arn:aws:ecs:ap-south-1:000000000000:service/sentinel-demo/checkout-api';
export const awsScenarios = {
 healthy: { account: SIMULATED_ACCOUNT, serviceArn: SIMULATED_SERVICE_ARN, running: 2, desired: 2, alarm: 'ok' },
 deployment: { account: SIMULATED_ACCOUNT, serviceArn: SIMULATED_SERVICE_ARN, running: 1, desired: 2, alarm: 'alarm' },
 'read-failure': { account: SIMULATED_ACCOUNT, serviceArn: SIMULATED_SERVICE_ARN, running: null, desired: null, alarm: 'unavailable' },
 stale: { account: SIMULATED_ACCOUNT, serviceArn: SIMULATED_SERVICE_ARN, running: 2, desired: 2, alarm: 'stale' },
 contradictory: { account: SIMULATED_ACCOUNT, serviceArn: SIMULATED_SERVICE_ARN, running: 2, desired: 2, alarm: 'alarm' },
} as const;
export function assertSimulatedIdentifier(value: string) {
 if (!value.includes(`:${SIMULATED_ACCOUNT}:`) && value !== SIMULATED_ACCOUNT) throw new Error('Simulation rejects real resource identifiers');
}
