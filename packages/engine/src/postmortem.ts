export interface DraftEvidence { id: string; source: string; outcome: string; provenance: 'live' | 'simulated' | null; summary: string }
export interface DraftSection { kind: 'fact' | 'gap' | 'hypothesis' | 'action'; body: string; evidenceId: string | null }
export function draftPostmortem(evidence: readonly DraftEvidence[], notes: readonly string[]): DraftSection[] {
 const sections: DraftSection[] = evidence.filter(row => row.outcome === 'ok' && row.provenance === 'live').map(row => ({ kind: 'fact', body: row.summary, evidenceId: row.id }));
 for (const row of evidence.filter(item => item.provenance === 'simulated')) sections.push({ kind: 'hypothesis', body: `${row.source} is simulated. ${row.summary}`, evidenceId: row.id });
 for (const row of evidence.filter(item => item.outcome !== 'ok')) sections.push({ kind: 'gap', body: `${row.source} is ${row.outcome}.`, evidenceId: row.id });
 if (!sections.length) sections.push({ kind: 'gap', body: 'No stored evidence was available for this draft.', evidenceId: null });
 for (const note of notes) sections.push({ kind: 'action', body: note, evidenceId: null });
 return sections;
}
export function assertPostmortem(sections: readonly DraftSection[]) {
 if (sections.some(section => section.kind === 'fact' && !section.evidenceId)) throw new Error('A fact requires stored evidence');
}
export function postmortemMarkdown(sections: readonly DraftSection[]) {
 return sections.map(section => `- ${section.kind}: ${section.body}${section.evidenceId ? ` (${section.evidenceId})` : ''}`).join('\n');
}
