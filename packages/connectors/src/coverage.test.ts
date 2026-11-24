import { expect, it } from 'vitest';
import { assessCoverage } from './coverage';

it('rejects warm-up and gaps even when sample counts are inflated', () => {
 const end = 21600;
 expect(assessCoverage(Array.from({length:80},(_,i)=>[end-1200+i*15, '1'] as [number,string]), 0, end).covered).toBe(false);
 expect(assessCoverage(Array.from({length:2000},()=>[end, '1'] as [number,string]), 0, end).covered).toBe(false);
 const gap = Array.from({length:1441},(_,i)=>[i*15, '1'] as [number,string]).filter(([t])=>t<10000||t>11000);
 expect(assessCoverage(gap,0,end).covered).toBe(false);
});
it('does not treat twenty minutes of samples as six-hour coverage', () => {
 const end = 21600;
 const samples = Array.from({ length: 80 }, (_, i) => [end - 1200 + i * 15, '1'] as [number, string]);
 expect(assessCoverage(samples, end - 21600, end).covered).toBe(false);
});
it('accepts an actual covered window and rejects unhealthy samples', () => {
 const samples = Array.from({length:1441},(_,i)=>[i*15, '1'] as [number,string]);
 expect(assessCoverage(samples,0,21600).covered).toBe(true);
 expect(assessCoverage(samples.map(([t])=>[t,'0']),0,21600).covered).toBe(false);
});
