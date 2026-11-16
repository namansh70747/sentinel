import { describe, expect, it } from 'vitest';
import { assertAllowed } from './egress';
describe('egress allowlist', () => {
 it('rejects link-local hosts before any request', () => {
  expect(() => assertAllowed('http://169.254.169.254/latest', '127.0.0.1,localhost')).toThrow('allowlisted');
 });
 it('accepts an allowlisted host', () => {
  expect(assertAllowed('http://127.0.0.1:9090/api/v1/query', '127.0.0.1').hostname).toBe('127.0.0.1');
 });
});
