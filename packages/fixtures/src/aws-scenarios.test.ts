import { expect, it } from 'vitest';
import { assertSimulatedIdentifier, awsScenarios } from './aws-scenarios';
it('keeps every scenario on the fictional account', () => {
 for (const scenario of Object.values(awsScenarios)) expect(scenario.account).toBe('000000000000');
 expect(() => assertSimulatedIdentifier('arn:aws:ecs:us-east-1:123456789012:service/prod/api')).toThrow(/real/);
});
