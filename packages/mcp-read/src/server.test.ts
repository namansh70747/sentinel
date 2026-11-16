import { describe, expect, it } from 'vitest';
import { tools } from './server';
describe('read-only evidence tools', () => {
 it('exports no write tool', () => {
  expect(tools).toEqual(['list_incidents', 'get_incident', 'read_audit']);
  expect(tools.some(tool => /insert|update|delete|act/i.test(tool))).toBe(false);
 });
});
