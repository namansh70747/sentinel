import { expect, it } from 'vitest';
import { assessSources, recoveryAllowed } from './assessment';
it('keeps simulated ECS beside a live impact and refuses it as recovery', () => {
 const sources = [
  { source: 'prometheus', outcome: 'ok', provenance: 'live' as const, windowCovered: true },
  { source: 'ecs', outcome: 'ok', provenance: 'simulated' as const, summary: 'task started' },
 ];
 const assessment = assessSources(sources);
 expect(assessment.impact).toBe('measured');
 expect(assessment.provenanceSummary).toBe('mixed');
 expect(assessment.hypotheses[0].text).toContain('simulated');
 expect(recoveryAllowed(sources)).toBe(true);
 expect(recoveryAllowed([{ source: 'ecs', outcome: 'ok', provenance: 'simulated', windowCovered: true }])).toBe(false);
 expect(recoveryAllowed([{ source: 'prometheus', outcome: 'ok', provenance: 'live', windowCovered: false }])).toBe(false);
});
