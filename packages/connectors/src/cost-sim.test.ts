import { describe, expect, it } from 'vitest';
import { simulateCost } from './cost-sim';
describe('simulated cost', () => {
 it('rejects a real-looking account', () => {
  expect(() => simulateCost('123456789012')).toThrow('fictional');
  expect(simulateCost('000000000000').note).toContain('not a bill');
 });
});
