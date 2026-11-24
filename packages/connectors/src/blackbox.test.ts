import { expect, it } from 'vitest';
import { interpretProbe } from './blackbox';
it('separates an unreachable probe from certificate age', () => {
 expect(interpretProbe(null, null, 1_700_000_000).outcome).toBe('unavailable');
 expect(interpretProbe(1, 1_700_000_000 + 86400 * 10, 1_700_000_000).certificateDays).toBe(10);
 expect(interpretProbe(0, null, 1_700_000_000).outcome).toBe('failed');
});
