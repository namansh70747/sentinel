import { randomBytes,randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { SentinelDatabase } from './index';
import { SecretVault } from '@sentinel/connectors/secrets';
import { ConnectorRepository } from './repositories/connectors';
import { NotificationRepository } from './repositories/notifications';
import { InvestigationRepository } from './repositories/investigations';
describe.skipIf(!process.env.TEST_DATABASE_URL)('approved notification ledger',()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),vault=new SecretVault(randomBytes(32));
 const connectors=new ConnectorRepository(db,vault),notifications=new NotificationRepository(db,vault),runs=new InvestigationRepository(db);
 const workspace=randomUUID(),other=randomUUID(),service=randomUUID(),incident=randomUUID();
 beforeAll(async()=>{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2),($3,$4)',[workspace,'Communication',other,'Other']);
  await db.inWorkspace(workspace,async c=>{await c.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'web','test','000000000000','local','fixture')",[workspace,service]);await c.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Test incident','recovered','sev4')",[workspace,incident,service]);});
 });
 afterAll(()=>db.close());
 it('requires version-bound approval, records intent before sending and never retries unknown results',async()=>{
  const connector=await connectors.create(workspace,'test',{provider:'ntfy',name:'Local test',mode:'live',config:{endpoint:'http://ntfy:80',topic:'sentinel-test-topic'}},{token:'secret-notification-token'});
  const input={serviceId:service,connectorId:connector.id,expectedVersion:1,destinationLabel:'Approved fixture topic',approvedTestDestination:true};
  await expect(notifications.subscribe(workspace,'test',{...input,approvedTestDestination:false})).rejects.toThrow('approval');
  const subscription=await notifications.subscribe(workspace,'test',input);expect((await notifications.subscribe(workspace,'test',input)).id).toBe(subscription.id);
  await expect(notifications.subscribe(other,'test',input)).rejects.toThrow();
  const queued=await notifications.queueTest(workspace,'test',subscription.id),claimed=await notifications.claim(workspace);
  expect(claimed?.deliveryId).toBe(queued.id);expect(claimed?.secret.token).toBe('secret-notification-token');
  expect((await notifications.history(workspace))[0].status).toBe('sending');
  const attempts=await db.inWorkspace(workspace,async c=>(await c.query('SELECT status FROM notification_attempts WHERE delivery_id=$1',[queued.id])).rows);expect(attempts).toEqual([{status:'started'}]);
  await notifications.finish(workspace,queued.id,claimed!.attemptId,{status:'unknown',errorCode:'unavailable'});
  expect(await notifications.claim(workspace)).toBeNull();
  await notifications.finish(workspace,queued.id,claimed!.attemptId,{status:'confirmed'});
  expect((await notifications.history(workspace))[0].status).toBe('unknown');expect(await notifications.history(other)).toEqual([]);
  expect(JSON.stringify(await notifications.history(workspace))).not.toContain('secret-notification-token');
  await connectors.update(workspace,'test',connector.id,1,{provider:'ntfy',name:'Changed destination',mode:'live',config:{endpoint:'http://ntfy:80',topic:'sentinel-changed-topic'}});
  await expect(notifications.queueTest(workspace,'test',subscription.id)).rejects.toThrow('destination');
  await notifications.disable(workspace,'test',subscription.id);
 });
 it('records exactly one delivery intent per approved subscription and completed run',async()=>{
  const connector=await connectors.create(workspace,'test',{provider:'ntfy',name:'Incident updates',mode:'live',config:{endpoint:'http://ntfy:80',topic:'sentinel-test-topic'}},{token:'private-test-token'});
  const subscription=await notifications.subscribe(workspace,'test',{serviceId:service,connectorId:connector.id,expectedVersion:1,destinationLabel:'Incident fixture',approvedTestDestination:true});
  const run=await runs.create(workspace,incident,'test'),input={workspaceId:workspace,serviceId:service,incidentId:incident,runId:run.id};
  await runs.finish(input,'escalated','No metrics configured');await runs.finish(input,'escalated','No metrics configured');
  const history=(await notifications.history(workspace)).filter(row=>row.subscription_id===subscription.id);expect(history).toHaveLength(1);expect(history[0].event_key).toBe(`investigation:${run.id}`);
  const claimed=await notifications.claim(workspace);expect(claimed?.deliveryId).toBe(history[0].id);
  await db.inWorkspace(workspace,c=>c.query("UPDATE notification_deliveries SET started_at=now()-interval '3 minutes' WHERE id=$1",[history[0].id]));
  expect(await notifications.claim(workspace)).toBeNull();
  expect((await notifications.history(workspace)).find(row=>row.id===history[0].id)?.status).toBe('unknown');
 });
});
