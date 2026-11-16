import { describe, expect, it } from 'vitest';
import { simulateDr } from './dr-sim';
describe('simulated disaster recovery', () => {
 it('does not claim a restore', () => {
  expect(() => simulateDr('123456789012')).toThrow('fictional');
  expect(simulateDr('000000000000').note).toBe('Restore was not attempted.');
 });
});