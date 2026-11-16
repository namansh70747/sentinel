import { expect, it } from 'vitest';
import { qualifiedSeverity } from './severity';
import type { SliWindows } from '@sentinel/contracts';
const sample:SliWindows={availabilitySlo:.999,latencySloMs:300,good5m:800,total5m:1000,good30m:800,total30m:1000,good1h:800,total1h:1000,good6h:800,total6h:1000,p99_10m_ms:100,dataLoss:false};
const none={fiveMinutes:false,tenMinutes:false,thirtyMinutes:false,oneHour:false,sixHours:false};
it('does not certify a burn severity from incomplete windows',()=>{
 expect(qualifiedSeverity(sample,none)).toBeNull();
 expect(qualifiedSeverity(sample,{...none,fiveMinutes:true})).toBeNull();
 expect(qualifiedSeverity(sample,{...none,fiveMinutes:true,oneHour:true})).toBe('sev1');
});
it('qualifies actual short-window blackhole and latency independently',()=>{
 expect(qualifiedSeverity({...sample,good5m:0},{...none,fiveMinutes:true})).toBe('sev1');
 expect(qualifiedSeverity({...sample,p99_10m_ms:500},{...none,tenMinutes:true})).toBe('sev3');
});
it('requires complete qualifying evidence before calling the service healthy',()=>{
 const healthy={...sample,good5m:1000,good30m:1000,good1h:1000,good6h:1000};
 expect(qualifiedSeverity(healthy,{...none,fiveMinutes:true})).toBeNull();
 expect(qualifiedSeverity(healthy,{fiveMinutes:true,tenMinutes:true,thirtyMinutes:true,oneHour:true,sixHours:true})).toBe('sev4');
});
