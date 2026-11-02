import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
const base = process.env.TEST_CONSOLE_URL;
describe.skipIf(!base || !process.env.TEST_DATABASE_URL)('authenticated workspace HTTP boundary', () => {
 const db = new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 const tokens = [randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')];
 const headers = (index:number) => ({cookie:`sentinel_session=${tokens[index]}`,origin:base!,'content-type':'application/json'});
 beforeAll(async () => {
  for(const raw of tokens) {
   const id=randomUUID();
   await db.pool.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3)',[id,'https://identity.example',id]);
   await db.pool.query("INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(raw).digest('hex'),id]);
  }
 });
 afterAll(()=>db.close());
 it('requires authentication and denies cross-tenant reads and writes',async()=>{
  expect((await fetch(`${base}/api/workspaces`)).status).toBe(401);
  const created=await fetch(`${base}/api/workspaces`,{method:'POST',headers:headers(0),body:JSON.stringify({name:'HTTP boundary test'})});
  expect(created.status).toBe(201);
  const workspace=await created.json();
  const services=`${base}/api/workspaces/${workspace.workspace_id}/services`;
  expect((await fetch(services,{headers:headers(1)})).status).toBe(404);
  expect((await fetch(services,{method:'POST',headers:headers(1),body:'{}'})).status).toBe(403);
  const response=await fetch(services,{method:'POST',headers:headers(0),body:JSON.stringify({name:'web',owner:'platform',account_id:'123456789012',region:'us-east-1',resource_arn:'arn:aws:ecs:us-east-1:123456789012:service/test/web'})});
  expect(response.status).toBe(201);
  expect((await response.json()).act).toBe(false);
  const rows=await (await fetch(services,{headers:headers(0)})).json();
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe('web');
  const audit=await db.inWorkspace(workspace.workspace_id,async client=>(await client.query('SELECT action FROM audit_events ORDER BY sequence')).rows);
  expect(audit.map(row=>row.action)).toEqual(['workspace.created','service.created']);
  const incidents=`${base}/api/workspaces/${workspace.workspace_id}/incidents`;
  expect((await fetch(incidents,{headers:headers(1)})).status).toBe(404);
  expect((await fetch(incidents,{method:'POST',headers:headers(1),body:JSON.stringify({serviceId:rows[0].id,title:'intrusion'})})).status).toBe(404);
  expect((await fetch(incidents,{method:'POST',headers:{...headers(0),origin:'https://attacker.example'},body:'{}'})).status).toBe(403);
  const investigation=await fetch(incidents,{method:'POST',headers:headers(0),body:JSON.stringify({serviceId:rows[0].id,title:'Investigate availability'})});
  expect(investigation.status).toBe(202);
  const pending=await investigation.json();
  const listed=await (await fetch(incidents,{headers:headers(0)})).json();
  expect(listed[0].id).toBe(pending.id);
  expect(listed[0].observed_severity).toBeNull();
  const jobs=await db.pool.query('SELECT incident_id FROM investigation_jobs WHERE incident_id=$1',[pending.id]);
  expect(jobs.rowCount).toBe(1);
  const auditUrl=`${base}/api/workspaces/${workspace.workspace_id}/audit`;
  expect((await fetch(auditUrl,{headers:headers(1)})).status).toBe(404);
  const history=await (await fetch(auditUrl,{headers:headers(0)})).json();
  expect(history.integrity.verified).toBe(true);
  expect(history.events.map((entry:{action:string})=>entry.action)).toContain('incident.requested');
  const webhooks=`${base}/api/workspaces/${workspace.workspace_id}/webhooks`;
  expect((await fetch(webhooks,{headers:headers(1)})).status).toBe(404);
  const endpointResponse=await fetch(webhooks,{method:'POST',headers:headers(0),body:JSON.stringify({serviceId:rows[0].id})});
  expect(endpointResponse.status).toBe(201);
  const endpoint=await endpointResponse.json();
  const delivery={alerts:[{status:'firing',fingerprint:'http-test',startsAt:'2026-11-02T00:00:00Z',labels:{alertname:'CRITICAL: title must not set severity'}}]};
  expect((await fetch(endpoint.url,{method:'POST',headers:{'x-sentinel-secret':'wrong'},body:JSON.stringify(delivery)})).status).toBe(401);
  const deliver=()=>fetch(endpoint.url,{method:'POST',headers:{'content-type':'application/json','x-sentinel-secret':endpoint.secret},body:JSON.stringify(delivery)});
  const first=await deliver();expect(first.status).toBe(202);expect((await first.json()).investigationsQueued).toBe(1);
  expect((await (await deliver()).json()).investigationsQueued).toBe(0);
  delivery.alerts[0].status='resolved';
  expect((await (await deliver()).json()).investigationsQueued).toBe(0);
  const latest=await (await fetch(incidents,{headers:headers(0)})).json();
  const incoming=latest.find((row:{title:string})=>row.title.startsWith('CRITICAL:'));
  expect(incoming.state).toBe('investigating');expect(incoming.observed_severity).toBeNull();
  expect((await fetch(webhooks,{method:'DELETE',headers:headers(0),body:JSON.stringify({endpointId:endpoint.id})})).status).toBe(200);
  expect((await deliver()).status).toBe(401);


 });
});
