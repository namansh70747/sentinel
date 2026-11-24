import { expect, it } from 'vitest';
import { readEcsMode } from './activities';

it('rejects simulation in the product worker', () => {
 expect(() => readEcsMode('simulated')).toThrow();
 expect(readEcsMode('off')).toBe('off');
});
