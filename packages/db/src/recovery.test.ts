import { expect, it } from 'vitest';
import { qualifiesForRecovery } from './repositories/collaboration';

it('requires real healthy traffic and coverage for both recovery objectives', () => {
 const sample = {
  good5m:100, total5m:100, p99_10m_ms:100,
  coverage:[
   {windowSeconds:300,inputs:[{input:'goodCoverageQuery',covered:true},{input:'totalCoverageQuery',covered:true}]},
   {windowSeconds:600,inputs:[{input:'latencyCoverageQuery',covered:true}]},
  ],
 };
 const evidence={outcome:'uncovered',provenance:'live',detail:sample,availability_target:0.99,latency_target_ms:300};
 expect(qualifiesForRecovery(evidence)).toBe(true);
 expect(qualifiesForRecovery({...evidence,provenance:'simulated'})).toBe(false);
 for (const change of [{total5m:0},{good5m:90},{p99_10m_ms:400},{coverage:sample.coverage.slice(0,1)}]) {
  expect(qualifiesForRecovery({...evidence,detail:{...sample,...change}})).toBe(false);
 }
});
