export type SourceRow = { source: string; outcome: string; provenance: string | null; observed_at: string | null; window_covered: boolean | null; detail: unknown };
export function CloudWatchDetail({ detail }: { detail: unknown }) {
 if (!detail || typeof detail !== 'object') return null;
 const metrics = 'metrics' in detail && Array.isArray(detail.metrics) ? detail.metrics : [];
 return <>
  {metrics.map(metric => {
   const label = metric?.metric === 'CPUUtilization' ? 'CPU' : metric?.metric === 'MemoryUtilization' ? 'Memory' : null;
   const latest = Array.isArray(metric?.points) ? metric.points.at(-1) : null;
   if (!label || typeof latest?.average !== 'number' || !Number.isFinite(latest.average)) return null;
   const displayed=latest.average>0&&latest.average<0.1?'<0.1%':latest.average.toFixed(1)+'%';
   return <span key={label}>{label} {displayed}{metric.partial && ' (partial)'}{typeof latest.timestamp==='string'&&<> · <time dateTime={latest.timestamp}>{new Date(latest.timestamp).toLocaleString()}</time></>}</span>;
  })}
 </>;
}

export function SourceList({ sources }: { sources: SourceRow[] }) {
 if (!sources.length) return <p>No evidence yet.</p>;
 return <ul className="source-list">
  {sources.map(source => <li key={source.source} className={source.provenance === 'simulated' ? 'simulated' : 'live'}>
   <strong>{source.source}</strong>
   <span>{source.outcome}</span>
   <span>{source.provenance === 'simulated' ? 'Simulated lead, not a cause' : source.provenance === 'live' ? 'Live' : 'No observation'}</span>
   {source.source === 'cloudwatch' && <CloudWatchDetail detail={source.detail} />}
   <EvidenceContext source={source.source} detail={source.detail} />
   {source.source === 'prometheus' && source.window_covered === false && <span>Six-hour window is not covered.</span>}
  </li>)}
 </ul>;
}

export function EvidenceContext({source,detail}:{source:string;detail:unknown}) {
 if (!detail || typeof detail!=='object') return null;
 if ('reason' in detail && typeof detail.reason==='string') return <span>{detail.reason}</span>;
 if (source==='cloudwatch-logs'&&'eventCount' in detail&&typeof detail.eventCount==='number') return <p>{detail.eventCount} log events sampled in the requested 24-hour window{('partial' in detail&&detail.partial)?' · partial sample':''}.</p>;
 if (source==='cost' && 'days' in detail && Array.isArray(detail.days)) return <section aria-label="Tagged AWS cost">
  <p>Daily unblended cost for the configured billing tag.</p>
  {detail.days.length>0&&<ul>{detail.days.map((day,index)=><li key={index}>{day.date} · {day.amount} {day.currency}{day.estimated?' · estimated':''}</li>)}</ul>}
 </section>;
 if (source==='dr' && 'recoveryPoints' in detail && Array.isArray(detail.recoveryPoints)) return <section aria-label="AWS Backup inventory">
  <p>{detail.recoveryPoints.length} recovery points. Restore verification is pending.</p>
  {detail.recoveryPoints.length>0&&<ul>{detail.recoveryPoints.map((point,index)=><li key={index}>{point.createdAt?new Date(point.createdAt).toLocaleString():'Unknown date'} · {point.status??'Unknown status'}</li>)}</ul>}
 </section>;
 return null;
}
