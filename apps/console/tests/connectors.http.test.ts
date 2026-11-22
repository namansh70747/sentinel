import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
const base=process.env.TEST_CONSOLE_URL;
describe.skipIf(!base||!process.env.TEST_DATABASE_URL)('connector HTTP authorization',()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 const tokens=[randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')];
 const headers=(index=0)=>({cookie:`sentinel_session=${tokens[index]}`,origin:base!,'content-type':'application/json'});
 let workspaceId:string,serviceId:string;
 beforeAll(async()=>{
  for(const token of tokens){const id=randomUUID();await db.pool.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3)',[id,'https://identity.example',id]);await db.pool.query("INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);}
  const workspace=await(await fetch(`${base}/api/workspaces`,{method:'POST',headers:headers(),body:JSON.stringify({name:'Connector boundary'})})).json();workspaceId=workspace.workspace_id;
  const service=await(await fetch(`${base}/api/workspaces/${workspaceId}/services`,{method:'POST',headers:headers(),body:JSON.stringify({name:'checkout',owner:'test',account_id:'000000000000',region:'ap-south-1',resource_arn:'arn:aws:ecs:ap-south-1:000000000000:service/sentinel-demo/checkout-api'})})).json();serviceId=service.id;
 });
 afterAll(async()=>{
  if(workspaceId)await db.inWorkspace(workspaceId,client=>client.query("UPDATE connector_tests SET status='failed',finished_at=now(),result=$1 WHERE status IN ('queued','running')",[{outcome:'not-configured',capability:'test-fixture',recordCount:0}]));
  await db.close();
 });
 it('protects credentials, enforces versions and tenant ownership, and queues tests',async()=>{
  const endpoint=`${base}/api/workspaces/${workspaceId}/connectors`;
  expect((await fetch(endpoint)).status).toBe(401);
  expect((await fetch(endpoint,{headers:headers(1)})).status).toBe(404);
  const draft={provider:'loki',name:'Checkout logs',mode:'live',config:{endpoint:'http://loki:3100'}};
  expect((await fetch(endpoint,{method:'POST',headers:{...headers(),origin:'https://wrong.example'},body:JSON.stringify(draft)})).status).toBe(403);
  const created=await fetch(endpoint,{method:'POST',headers:headers(),body:JSON.stringify({...draft,secret:{token:'never-return-this-token'}})});
  expect(created.status).toBe(201);const connector=await created.json();expect(connector.hasSecret).toBe(true);expect(JSON.stringify(connector)).not.toContain('never-return');
  const list=await(await fetch(endpoint,{headers:headers()})).json();expect(list[0].id).toBe(connector.id);expect(JSON.stringify(list)).not.toContain('never-return');
  const binding=`${base}/api/workspaces/${workspaceId}/services/${serviceId}/connector-bindings/loki`;
  expect((await fetch(binding,{method:'PUT',headers:headers(),body:JSON.stringify({connectorId:connector.id,expectedVersion:1,mapping:{query:'{service_name="checkout"}'}})})).status).toBe(200);
  expect((await fetch(`${endpoint}/${connector.id}`,{method:'PATCH',headers:headers(),body:JSON.stringify({...draft,name:'Updated logs',expectedVersion:1})})).status).toBe(200);
  expect((await fetch(`${endpoint}/${connector.id}`,{method:'PATCH',headers:headers(),body:JSON.stringify({...draft,expectedVersion:1})})).status).toBe(409);
  const requested=await fetch(`${endpoint}/${connector.id}/tests`,{method:'POST',headers:headers()});expect(requested.status).toBe(202);const job=await requested.json();
  const test=await fetch(`${endpoint}/${connector.id}/tests/${job.id}`,{headers:headers()});expect(test.status).toBe(200);expect((await test.json()).configVersion).toBe(2);
  expect((await fetch(`${endpoint}/${connector.id}/tests/${job.id}`,{headers:headers(1)})).status).toBe(404);
  const audit=await db.inWorkspace(workspaceId,async client=>(await client.query('SELECT payload FROM audit_events')).rows);expect(JSON.stringify(audit)).not.toContain('never-return');
 },30000);
});
