import { createHash } from 'node:crypto';
export interface GrafanaSignal {dedupeKey:string;title:string;status:'firing'|'resolved'}
export function normalizeGrafanaAlerts(body:unknown):GrafanaSignal[] {
 if(!body||typeof body!=='object'||!Array.isArray((body as {alerts?:unknown}).alerts))throw new Error('Expected Grafana alerts array');
 const alerts=(body as {alerts:unknown[]}).alerts;
 if(alerts.length>100)throw new Error('At most 100 alerts per delivery');
 return alerts.map(alert=>{
  if(!alert||typeof alert!=='object')throw new Error('Invalid alert');
  const row=alert as Record<string,unknown>;
  if(!['firing','resolved'].includes(row.status as string)||typeof row.fingerprint!=='string'||!row.fingerprint||row.fingerprint.length>512||typeof row.startsAt!=='string'||!Number.isFinite(Date.parse(row.startsAt)))throw new Error('Alert status, fingerprint and start time required');
  const labels=row.labels as Record<string,unknown>|undefined;
  const title=labels&&typeof labels.alertname==='string'?labels.alertname.slice(0,500):'Grafana service alert';
  return {dedupeKey:createHash('sha256').update(JSON.stringify([row.fingerprint,row.startsAt,row.status])).digest('hex'),title,status:row.status as 'firing'|'resolved'};
 });
}
