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
  const detailUrl=`${incidents}/${pending.id}`;
  expect((await fetch(detailUrl)).status).toBe(401);
  expect((await fetch(detailUrl,{headers:headers(1)})).status).toBe(404);
  expect((await fetch(`${incidents}/${randomUUID()}`,{headers:headers(0)})).status).toBe(404);
  const detailResponse=await fetch(detailUrl,{headers:headers(0)});
  expect(detailResponse.status).toBe(200);
  expect(await detailResponse.json()).toMatchObject({id:pending.id,title:'Investigate availability',sources:[]});
  // The detail route must not depend on the list's first 100 entries.
  await db.inWorkspace(workspace.workspace_id,async client=>{
   for(let index=0;index<101;index++) await client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'newer incident','investigating','sev4')",[workspace.workspace_id,randomUUID(),rows[0].id]);
  });
  expect((await (await fetch(incidents,{headers:headers(0)})).json()).some((row:{id:string})=>row.id===pending.id)).toBe(false);
  expect((await (await fetch(detailUrl,{headers:headers(0)})).json()).id).toBe(pending.id);
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

 it('opens the dashboard for the workspace membership and denies an unrelated member',async()=>{
  const created=await fetch(`${base}/api/workspaces`,{method:'POST',headers:headers(0),body:JSON.stringify({name:'Role dashboard boundary'})});
  expect(created.status).toBe(201);
  const {workspace_id:id}=await created.json();
  const adminUrl=`${base}/dashboard/admin?workspace=${id}`;
  const signedOut=await fetch(adminUrl,{redirect:'manual'});
  expect(signedOut.headers.get('location')).toBe('/login');
  expect((await fetch(adminUrl,{headers:headers(1),redirect:'manual'})).status).toBe(404);

  const viewer=(await db.pool.query('SELECT identity_id FROM sessions WHERE token_hash=$1',[createHash('sha256').update(tokens[1]).digest('hex')])).rows[0];
  await db.pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'viewer')",[id,viewer.identity_id]);
  const redirected=await fetch(adminUrl,{headers:headers(1),redirect:'manual'});
  expect(redirected.headers.get('location')).toBe(`/dashboard/viewer?workspace=${id}`);
  const dashboard=await fetch(`${base}/dashboard/viewer?workspace=${id}`,{headers:headers(1)});
  expect(dashboard.status).toBe(200);
  const page=await dashboard.text();
  expect(page).toContain('Reliability overview');
  expect(page).not.toContain('Workspace administration');

  const second=await fetch(`${base}/api/workspaces`,{method:'POST',headers:headers(0),body:JSON.stringify({name:'Responder dashboard boundary'})});
  expect(second.status).toBe(201);
  const {workspace_id:responseWorkspace}=await second.json();
  await db.pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'responder')",[responseWorkspace,viewer.identity_id]);
  const responsePage=await fetch(`${base}/dashboard/responder?workspace=${responseWorkspace}`,{headers:headers(1)});
  expect(responsePage.status).toBe(200);
  expect(await responsePage.text()).toContain('Incident response');
 });
});
