export type SourceRow = { source: string; outcome: string; provenance: string | null; observed_at: string | null; window_covered: boolean | null; detail: unknown };
export function SourceList({ sources }: { sources: SourceRow[] }) {
 if (!sources.length) return <p>No evidence yet.</p>;
 return <ul className="source-list">
  {sources.map(source => <li key={source.source} className={source.provenance === 'simulated' ? 'simulated' : 'live'}>
   <strong>{source.source}</strong>
   <span>{source.outcome}</span>
   <span>{source.provenance === 'simulated' ? 'Simulated lead, not a cause' : source.provenance === 'live' ? 'Live' : 'Not configured'}</span>
   {source.source === 'prometheus' && source.window_covered === false && <span>Six-hour window is not covered.</span>}
  </li>)}
 </ul>;
}
