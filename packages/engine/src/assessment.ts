export interface AssessmentSource { source: string; outcome: string; provenance: 'live' | 'simulated' | null; summary?: string }
export interface Assessment {
 impact: 'measured' | 'unknown';
 provenanceSummary: 'live' | 'mixed' | 'simulated' | 'unknown';
 hypotheses: { text: string; provenance: 'live' | 'simulated' | 'unknown' }[];
 recoveryAllowed: boolean;
}
const liveImpact = (source: AssessmentSource) => source.source === 'prometheus' && source.provenance === 'live' && source.outcome === 'ok';
export function assessSources(sources: readonly AssessmentSource[]): Assessment {
 const meaningful = sources.filter(source => source.outcome !== 'not-configured');
 const live = meaningful.some(source => source.provenance === 'live');
 const simulated = meaningful.some(source => source.provenance === 'simulated');
 const provenanceSummary = live && simulated ? 'mixed' : live ? 'live' : simulated ? 'simulated' : 'unknown';
 const hypotheses = sources.filter(source => source.source === 'ecs').map(source => ({
  text: source.provenance === 'simulated' ? 'Deployment lead is simulated and is not a cause.' : source.summary || 'ECS observation recorded.',
  provenance: source.provenance === 'live' || source.provenance === 'simulated' ? source.provenance : 'unknown' as const,
 }));
 return { impact: sources.some(liveImpact) ? 'measured' : 'unknown', provenanceSummary, hypotheses, recoveryAllowed: sources.some(source => liveImpact(source) && source.outcome === 'ok') };
}
export function recoveryAllowed(sources: readonly { source: string; outcome: string; provenance: string | null; windowCovered?: boolean }[]) {
 return sources.some(source => source.source === 'prometheus' && source.provenance === 'live' && source.outcome === 'ok' && source.windowCovered === true);
}
