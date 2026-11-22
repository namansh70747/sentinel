import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
const base=process.env.TEST_CONSOLE_URL;
describe.skipIf(!base||!process.env.TEST_DATABASE_URL)('connector HTTP authorization',()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 const tokens=Array.from({length:3},()=>randomBytes(32).toString('base64url')),identities:string[]=[];
 const headers=(index=0)=>({cookie:`sentinel_session=${tokens[index]}`,origin:base!,'content-type':'application/json'});
 let workspaceId:string,serviceId:string;
 beforeAll(async()=>{
  for(const token of tokens){const id=randomUUID();identities.push(id);await db.pool.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3)',[id,'https://identity.example',id]);await db.pool.query("INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);}
  const workspace=await(await fetch(`${base}/api/workspaces`,{method:'POST',headers:headers(),body:JSON.stringify({name:'Connector boundary'})})).json();workspaceId=workspace.workspace_id;
  const service=await(await fetch(`${base}/api/workspaces/${workspaceId}/services`,{method:'POST',headers:headers(),body:JSON.stringify({name:'checkout',owner:'test',account_id:'000000000000',region:'ap-south-1',resource_arn:'arn:aws:ecs:ap-south-1:000000000000:service/sentinel-demo/checkout-api'})})).json();serviceId=service.id;
  await db.pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'viewer')",[workspaceId,identities[2]]);
 });
 afterAll(async()=>{
  if(workspaceId)await db.inWorkspace(workspaceId,client=>client.query("UPDATE connector_tests SET status='failed',finished_at=now(),result=$1 WHERE status IN ('queued','running')",[{outcome:'not-configured',capability:'test-fixture',recordCount:0}]));
  if(workspaceId)await db.inWorkspace(workspaceId,client=>client.query("UPDATE notification_deliveries SET status='failed',finished_at=now(),error_code='test-fixture' WHERE status='queued'"));
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
 it('creates distinct refresh runs, permits viewer reads and denies viewer mutations',async()=>{
  const incidentId=randomUUID();await db.inWorkspace(workspaceId,c=>c.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Refresh test','recovered','sev4')",[workspaceId,incidentId,serviceId]));
  const endpoint=`${base}/api/workspaces/${workspaceId}/incidents/${incidentId}/investigations`;
  expect((await fetch(endpoint,{method:'POST',headers:headers(2)})).status).toBe(403);
  const firstResponse=await fetch(endpoint,{method:'POST',headers:headers()});expect(firstResponse.status).toBe(202);const first=await firstResponse.json();
  const second=await(await fetch(endpoint,{method:'POST',headers:headers()})).json();expect(second.id).not.toBe(first.id);
  const read=`${base}/api/workspaces/${workspaceId}/investigations/${first.id}`;
  const viewed=await fetch(read,{headers:headers(2)});expect(viewed.status).toBe(200);expect((await viewed.json()).attempts).toHaveLength(8);
  expect((await fetch(read,{headers:headers(1)})).status).toBe(404);
 },30000);
 it('requires explicit destination approval and protects delivery management across roles and workspaces',async()=>{
  const root=`${base}/api/workspaces/${workspaceId}`;
  const connection=await(await fetch(root+'/connectors',{method:'POST',headers:headers(),body:JSON.stringify({provider:'ntfy',name:'Fixture notifications',mode:'live',config:{endpoint:'http://ntfy:80',topic:'sentinel-fixture-topic'},secret:{token:'private-fixture-notification-token'}})})).json();
  const draft={serviceId,connectorId:connection.id,expectedVersion:1,destinationLabel:'Explicit fixture destination',approvedTestDestination:true};
  expect((await fetch(root+'/notification-subscriptions',{method:'POST',headers:headers(2),body:JSON.stringify(draft)})).status).toBe(403);
  expect((await fetch(root+'/notification-subscriptions',{method:'POST',headers:headers(),body:JSON.stringify({...draft,approvedTestDestination:false})})).status).toBe(400);
  const created=await fetch(root+'/notification-subscriptions',{method:'POST',headers:headers(),body:JSON.stringify(draft)});expect(created.status).toBe(201);const subscription=await created.json();
  const test=root+`/notification-subscriptions/${subscription.id}/tests`;
  expect((await fetch(test,{method:'POST',headers:headers(2)})).status).toBe(403);expect((await fetch(test,{method:'POST',headers:headers()})).status).toBe(202);
  expect((await fetch(root+'/notification-deliveries',{headers:headers(1)})).status).toBe(404);
  const history=await fetch(root+'/notification-deliveries',{headers:headers(2)});expect(history.status).toBe(200);expect(await history.text()).not.toContain('private-fixture-notification-token');
  expect((await fetch(root+`/notification-subscriptions/${subscription.id}`,{method:'PATCH',headers:headers(),body:JSON.stringify({enabled:false})})).status).toBe(200);
 },30000);
});
