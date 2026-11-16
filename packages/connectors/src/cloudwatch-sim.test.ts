import { describe, expect, it } from 'vitest';
import { simulateCloudWatch } from './cloudwatch-sim';
describe('simulated CloudWatch', () => {
 it('rejects any account other than the fictional one', () => {
  expect(() => simulateCloudWatch('123456789012')).toThrow('fictional');
  expect(simulateCloudWatch('000000000000').provenance).toBe('simulated');
 });
});
