import { createServer } from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { SentinelDatabase } from '@sentinel/db';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { GitHubSyncRepository } from '@sentinel/db/github-sync';
import { SecretVault } from '@sentinel/connectors/secrets';
import { GitHubSyncClient } from '@sentinel/connectors/github-sync';
import { ConnectorHttpClient } from '@sentinel/connectors/http';
import { GitHubSynchronizer } from './github-sync';
import { createActivities } from './activities';
it.skipIf(!process.env.TEST_DATABASE_URL)('reconciles two bound repositories through real HTTP pages and tracks CI status without duplicate objects',async()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),vault=new SecretVault(randomBytes(32)),connections=new ConnectorRepository(db,vault),repository=new GitHubSyncRepository(db);
 const workspace=randomUUID(),services=[randomUUID(),randomUUID()],token='private-github-fixture-token';let authorized=true,reads=0;
 const date=new Date().toISOString(),sha='a'.repeat(40),otherSha='b'.repeat(40);
 const server=createServer((request,response)=>{
  reads++;authorized&&=request.headers.authorization===`Bearer ${token}`&&request.headers['x-github-api-version']==='2026-03-10';
  const url=new URL(request.url!,'http://local');let body:unknown;
  if(url.pathname.endsWith('/commits')){
   if(url.pathname.includes('/checkout/')&&!url.searchParams.has('page')){const next=new URL('https://api.github.com'+request.url);next.searchParams.set('page','2');response.setHeader('link',`<${next.href}>; rel="next"`);}
   const revision=url.searchParams.has('page')?otherSha:sha;body=[{sha:revision,commit:{message:'Fixture commit',author:{date}}}];
  }else if(url.pathname.endsWith('/check-runs')){const revision=url.pathname.split('/').at(-2)!;body={check_runs:[{id:revision===sha?15:16,head_sha:revision,name:'Typecheck',status:'completed',conclusion:'success',completed_at:date}]};}
  else if(url.pathname.endsWith('/deployments'))body=[{id:12,sha,environment:'fixture',created_at:date}];
  else if(url.pathname.endsWith('/statuses'))body=[{id:17,state:'success',created_at:date}];
  else if(url.pathname.endsWith('/actions/runs'))body={workflow_runs:[{id:13,head_sha:sha,name:'Verify',status:'in_progress',conclusion:null,updated_at:date}]};
  else if(url.pathname.endsWith('/actions/runs/13'))body={id:13,head_sha:sha,name:'Verify',status:'completed',conclusion:'success',updated_at:date};
  else{response.writeHead(404);response.end();return;}
  response.setHeader('content-type','application/json');response.end(JSON.stringify(body));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const endpoint=`http://127.0.0.1:${address.port}`;
 try{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)',[workspace,'GitHub HTTP reconciliation']);
  await db.inWorkspace(workspace,async client=>{for(const id of services)await client.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,'test','000000000000','local','fixture')",[workspace,id,id]);});
  const connector=await connections.create(workspace,'test',{provider:'github',name:'Fixture read token',mode:'live',config:{}},{token});
  for(let index=0;index<services.length;index++)await connections.bind(workspace,'test',services[index],'github',connector.id,1,{owner:'team',repo:index?'billing':'checkout'});
  const request=await repository.request(workspace,'test',connector.id);
  const pendingIncident=randomUUID();await db.inWorkspace(workspace,client=>client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Pending GitHub sync','investigating','sev4')",[workspace,pendingIncident,services[0]]));
  expect((await createActivities(db,connections).collectGithub({workspaceId:workspace,serviceId:services[0],incidentId:pendingIncident})).outcome).toBe('uncovered');
  const http=new ConnectorHttpClient({allowedPrivateOrigins:[endpoint]});
  const factory=(credential:string)=>new GitHubSyncClient(credential,{get:(raw,headers)=>{const url=new URL(raw);return http.get(endpoint+url.pathname+url.search,headers);}});
  const scan={pool:{query:async()=>({rows:[{id:workspace}]})}} as unknown as SentinelDatabase;
  let worker=new GitHubSynchronizer(scan,connections,repository,factory);
  for(let index=0;index<30;index++){await worker.tick();if(index===2)worker=new GitHubSynchronizer(scan,connections,new GitHubSyncRepository(db),factory);if((await repository.requests(workspace,connector.id)).find(row=>row.id===request.id)?.status==='succeeded')break;}
  expect((await repository.requests(workspace,connector.id))[0].status).toBe('succeeded');expect(authorized).toBe(true);expect(reads).toBeGreaterThan(6);
  const first=await repository.changes(workspace,services[0]),second=await repository.changes(workspace,services[1]);
  expect(first.filter(row=>row.kind==='commits')).toHaveLength(2);expect(second.filter(row=>row.kind==='commits')).toHaveLength(1);
  expect(first.filter(row=>row.kind==='actions')).toHaveLength(1);expect(first.find(row=>row.kind==='actions')?.status).toBe('completed:success');
  expect(new Set(first.map(row=>row.kind))).toEqual(new Set(['commits','deployments','actions','checks','deployment-statuses']));
  const incidentId=randomUUID();await db.inWorkspace(workspace,client=>client.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'GitHub evidence','investigating','sev4')",[workspace,incidentId,services[0]]));
  expect((await createActivities(db,connections).collectGithub({workspaceId:workspace,serviceId:services[0],incidentId})).outcome).toBe('ok');
  const evidence=await db.inWorkspace(workspace,async client=>(await client.query("SELECT detail FROM incident_evidence WHERE incident_id=$1 AND source='github'",[incidentId])).rows[0].detail);
  expect(new Set(evidence.changes.map((row:{kind:string})=>row.kind))).toEqual(new Set(['commits','deployments','actions','checks','deployment-statuses']));expect(JSON.stringify(evidence)).not.toContain(token);
  const completed=await db.inWorkspace(workspace,async client=>(await client.query("SELECT spec,status FROM github_sync_resources WHERE status='complete'")).rows);
  expect(completed.some(row=>row.spec.workflowRunId===13)).toBe(true);expect(completed.some(row=>row.spec.kind==='checks')).toBe(true);
  await db.inWorkspace(workspace,client=>client.query("UPDATE github_sync_resources SET next_due_at=now() WHERE status='complete'"));
  expect(await repository.claim(workspace)).toBeNull();
  const repeat=await repository.request(workspace,'test',connector.id);expect(repeat.id).not.toBe(request.id);
  for(let index=0;index<30;index++){await worker.tick();if((await repository.requests(workspace,connector.id)).find(row=>row.id===repeat.id)?.status==='succeeded')break;}
  expect((await repository.requests(workspace,connector.id))[0].status).toBe('succeeded');
  expect((await repository.changes(workspace,services[0])).filter(row=>row.kind==='actions')).toHaveLength(1);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();}
},30000);
