export type SourceRow = { source: string; outcome: string; provenance: string | null; observed_at: string | null; window_covered: boolean | null; detail: unknown };
function CloudWatchDetail({ detail }: { detail: unknown }) {
 if (!detail || typeof detail !== 'object') return null;
 const metrics = 'metrics' in detail && Array.isArray(detail.metrics) ? detail.metrics : [];
 return <>
  {'reason' in detail && typeof detail.reason === 'string' && detail.reason !== '' && <span>CloudWatch: {detail.reason.replaceAll('-', ' ')}</span>}
  {metrics.map(metric => {
   const label = metric?.metric === 'CPUUtilization' ? 'CPU' : metric?.metric === 'MemoryUtilization' ? 'Memory' : null;
   const latest = Array.isArray(metric?.points) ? metric.points.at(-1) : null;
   if (!label || typeof latest?.average !== 'number') return null;
   return <span key={label}>{label} {latest.average.toFixed(1)}%{metric.partial && ' (partial)'}</span>;
  })}
 </>;
}

export function SourceList({ sources }: { sources: SourceRow[] }) {
 if (!sources.length) return <p>No evidence yet.</p>;
 return <ul className="source-list">
  {sources.map(source => <li key={source.source} className={source.provenance === 'simulated' ? 'simulated' : 'live'}>
   <strong>{source.source}</strong>
   <span>{source.outcome}</span>
   <span>{source.provenance === 'simulated' ? 'Simulated lead, not a cause' : source.provenance === 'live' ? 'Live' : 'Not configured'}</span>
   {source.source === 'cloudwatch' && <CloudWatchDetail detail={source.detail} />}
   {source.source === 'prometheus' && source.window_covered === false && <span>Six-hour window is not covered.</span>}
  </li>)}
 </ul>;
}
