export interface CoverageResult { covered: boolean; ratio: number; validSamples: number; expectedSamples: number; maximumGapSeconds: number }

/** Raw provider timestamps only: duplicate samples cannot establish collection coverage. */
export function assessCoverage(samples: readonly [number, string][], start: number, end: number, intervalSeconds = 15): CoverageResult {
 if (![start,end,intervalSeconds].every(Number.isFinite) || end <= start || intervalSeconds <= 0) throw new Error('Invalid coverage window');
 const expectedSamples = Math.floor((end - start) / intervalSeconds) + 1;
 const valid = [...new Set(samples.filter(([time,value]) => Number.isFinite(time) && time >= start && time <= end && Number(value) === 1).map(([time]) => time))].sort((a,b)=>a-b);
 // Count at most one valid observation per expected scrape slot.
 const occupied = new Set(valid.map(time=>Math.floor((time-start)/intervalSeconds)));
 const ratio = Math.min(1, occupied.size / expectedSamples);
 let maximumGapSeconds = valid.length ? Math.max(valid[0]-start, end-valid[valid.length-1]) : end-start;
 for(let i=1;i<valid.length;i++) maximumGapSeconds = Math.max(maximumGapSeconds,valid[i]-valid[i-1]);
 return { covered: ratio >= 0.8 && maximumGapSeconds <= intervalSeconds * 3, ratio, validSamples: occupied.size, expectedSamples, maximumGapSeconds };
}
