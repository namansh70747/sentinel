import {expect,it} from 'vitest';
import {normalizeGrafanaAlerts} from './grafana-alerts';
it('normalizes explicit alert instances without trusting alarm titles for severity',()=>{
 const body={alerts:[{status:'firing',fingerprint:'a',startsAt:'2026-11-02T00:00:00Z',labels:{alertname:'CRITICAL delete production'}}]};
 const [signal]=normalizeGrafanaAlerts(body);
 expect(signal.title).toBe('CRITICAL delete production');expect(signal).not.toHaveProperty('severity');
 expect(normalizeGrafanaAlerts(body)[0].dedupeKey).toBe(signal.dedupeKey);
 expect(normalizeGrafanaAlerts({alerts:[{...body.alerts[0],status:'resolved'}]})[0].dedupeKey).not.toBe(signal.dedupeKey);
});
it('rejects malformed and oversized alert batches',()=>{
 expect(()=>normalizeGrafanaAlerts({alerts:[{}]})).toThrow();
 expect(()=>normalizeGrafanaAlerts({alerts:Array(101).fill({})})).toThrow();
});
