import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
import { normalizeGrafanaAlerts } from '@sentinel/connectors';
// @ts-expect-error The scenario CLI is a native JavaScript module.
import { runTraffic } from '../../scripts/scenarios/traffic.mjs';

describe.skipIf(process.env.TEST_LIVE_GRAFANA!=='true')('actual local Grafana alert delivery',()=>{
 it('delivers a real evaluated alert, investigates it and deduplicates replay',async()=>{
  const workspaceId=process.env.TEST_LIVE_WORKSPACE_ID;
  const database=process.env.TEST_LIVE_DATABASE_URL;
  if(!workspaceId||!/^[a-f0-9-]{36}$/i.test(workspaceId)||!database)throw new Error('Explicit local workspace and database are required');
  const target=new URL(database);
  if(!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!=='/sentinel')throw new Error('This test uses only the local product database');
  const binding=JSON.parse(await readFile(`.local/grafana-${workspaceId}.json`,'utf8'));
  const db=new SentinelDatabase(database);
  const headers={authorization:'Basic '+Buffer.from(`admin:${process.env.GF_SECURITY_ADMIN_PASSWORD}`).toString('base64')};
  const traffic=runTraffic({scenario:'degradation',requests:600});
  try{
   let signal:{fingerprint:string;startsAt:string;labels:Record<string,string>;status:string}|undefined;
   await expect.poll(async()=>{
    const response=await fetch('http://127.0.0.1:3012/api/alertmanager/grafana/api/v2/alerts',{headers,signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`Grafana alerts query failed (${response.status})`);
    signal=(await response.json()).find((alert:{labels:Record<string,string>})=>alert.labels.alertname==='Checkout request failures');
    return Boolean(signal);
   },{timeout:120000,interval:1000}).toBe(true);
   const body={alerts:[{...signal!,status:'firing'}]};
   const keys=normalizeGrafanaAlerts(body)[0].compatibleDedupeKeys;
   // Wait for Grafana itself to authenticate and deliver this exact signal before replaying it.
   await expect.poll(async()=>Number((await db.pool.query('SELECT count(*) AS count FROM webhook_deliveries WHERE endpoint_id=$1 AND dedupe_key=ANY($2::text[])',[binding.id,keys])).rows[0].count),{timeout:120000,interval:1000}).toBe(1);
   const counts=()=>db.inWorkspace(workspaceId,async client=>Number((await client.query('SELECT count(*) AS count FROM incidents WHERE workspace_id=$1 AND service_id=$2',[workspaceId,binding.serviceId])).rows[0].count));
   const before=await counts();
   for(let attempt=0;attempt<2;attempt++){
    const response=await fetch(`http://localhost:3010/api/webhooks/grafana/${binding.id}`,{method:'POST',headers:{'content-type':'application/json','x-sentinel-secret':binding.secret},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    expect(response.status).toBe(202);expect((await response.json()).investigationsQueued).toBe(0);
   }
   expect(await counts()).toBe(before);
   await expect.poll(()=>db.inWorkspace(workspaceId,async client=>{
    const row=(await client.query("SELECT i.state,(SELECT count(*) FROM incident_evidence e WHERE e.workspace_id=i.workspace_id AND e.incident_id=i.id) AS sources FROM incidents i WHERE i.workspace_id=$1 AND i.service_id=$2 AND i.title='Checkout request failures' ORDER BY i.created_at DESC LIMIT 1",[workspaceId,binding.serviceId])).rows[0];
    return row&&['advised','escalated'].includes(row.state)&&Number(row.sources)===8;
   }),{timeout:60000,interval:1000}).toBe(true);
  }finally{await traffic;await db.close();}
 },360000);
});
