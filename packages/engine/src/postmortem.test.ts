import { expect, it } from 'vitest';
import { assertPostmortem, draftPostmortem, postmortemMarkdown } from './postmortem';
it('links facts to evidence and labels simulated rows', () => {
 const sections = draftPostmortem([
  { id: 'e1', source: 'prometheus', outcome: 'ok', provenance: 'live', summary: 'Error rate rose' },
  { id: 'e2', source: 'ecs', outcome: 'ok', provenance: 'simulated', summary: 'Task definition changed' },
 ], ['Checked the dashboard']);
 expect(sections.find(section => section.kind === 'fact')?.evidenceId).toBe('e1');
 expect(sections.find(section => section.kind === 'hypothesis')?.body).toContain('simulated');
 expect(postmortemMarkdown(sections)).toContain('e2');
 expect(() => assertPostmortem([{ kind: 'fact', body: 'guess', evidenceId: null }])).toThrow(/evidence/);
});
