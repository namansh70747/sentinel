import { randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,readFile,unlink,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SentinelDatabase } from '@sentinel/db';
import { McpTokenRepository } from '@sentinel/db/mcp-tokens';
import { RunbookRepository } from '@sentinel/db/runbooks';
import { prepareLocalCredential } from './local-credential';

it.skipIf(!process.env.TEST_DATABASE_URL)('serves real STDIO reads and rejects workspace crossover, unknown tools and revoked credentials',async()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!),tokens=new McpTokenRepository(db),workspace=randomUUID(),other=randomUUID(),identity=randomUUID();
 const directory=await mkdtemp(join(tmpdir(),'sentinel-mcp-')),tokenFile=join(directory,'token');
 let client:Client|undefined;
 try{
  await db.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2),($3,$4)',[workspace,'MCP allowed',other,'MCP forbidden']);
  await db.pool.query("INSERT INTO identities(id,issuer,subject) VALUES($1,'https://identity.example',$2)",[identity,identity]);
  await db.pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'admin')",[workspace,identity]);
  const issued=await tokens.issue(workspace,identity,'Protocol acceptance');await writeFile(tokenFile,issued.token,{mode:0o600});
  const service=randomUUID(),incident=randomUUID();
  await db.inWorkspace(workspace,async c=>{await c.query("INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,'checkout','test','000000000000','local','fixture')",[workspace,service]);await c.query("INSERT INTO incidents(workspace_id,id,service_id,title,state,severity) VALUES($1,$2,$3,'Protocol incident','investigating','sev4')",[workspace,incident,service]);});
  const runbook=await new RunbookRepository(db).import(workspace,identity,{slug:'protocol-recovery',title:'Protocol recovery',sourcePath:'recovery.md',markdown:'# Recovery\nInspect saturation.',serviceIds:[service],expectedVersion:0});
  const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','packages/mcp-read/src/main.ts'],cwd:process.cwd(),env:{PATH:process.env.PATH??'',DATABASE_URL:process.env.TEST_DATABASE_URL!,SENTINEL_MCP_WORKSPACE_ID:workspace,SENTINEL_MCP_TOKEN_FILE:tokenFile},stderr:'pipe'});
  client=new Client({name:'sentinel-protocol-acceptance',version:'1.0.0'});await client.connect(transport);
  const discovered=await client.listTools();expect(discovered.tools.map(tool=>tool.name)).toEqual(expect.arrayContaining(['list_incidents','read_audit','search_runbooks']));expect(discovered.tools.every(tool=>tool.annotations?.readOnlyHint===true)).toBe(true);
  const allowed=await client.callTool({name:'list_incidents',arguments:{workspaceId:workspace}});expect(allowed.isError).not.toBe(true);expect(JSON.stringify(allowed)).toContain('Protocol incident');
  for(const [name,args]of [['get_incident',{incidentId:incident}],['read_audit',{}],['search_runbooks',{query:'saturation'}],['get_runbook',{runbookId:runbook.id}] ] as const){const result=await client.callTool({name,arguments:{workspaceId:workspace,...args}});expect(result.isError).not.toBe(true);}
  const denied=await client.callTool({name:'list_incidents',arguments:{workspaceId:other}});expect(denied.isError).toBe(true);
  expect(await tokens.authorize(other,issued.token)).toBeNull();
  await expect(tokens.issue(other,identity,'Forbidden')).rejects.toThrow('administrator');
  const firstAudit=await client.callTool({name:'read_audit',arguments:{workspaceId:workspace,limit:1}});
  const firstAuditBody=JSON.parse((firstAudit.content as {type:string;text:string}[])[0].text);expect(firstAuditBody.nextCursor).toBeTruthy();
  const nextAudit=await client.callTool({name:'read_audit',arguments:{workspaceId:workspace,limit:1,after:firstAuditBody.nextCursor}});
  expect(JSON.parse((nextAudit.content as {type:string;text:string}[])[0].text).items[0].sequence).not.toBe(firstAuditBody.items[0].sequence);
  expect((await client.callTool({name:'delete_incident',arguments:{workspaceId:workspace}})).isError).toBe(true);
  expect((await client.callTool({name:'list_incidents',arguments:{workspaceId:workspace,limit:10000}})).isError).toBe(true);
  await db.pool.query('DELETE FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2',[workspace,identity]);
  expect((await client.callTool({name:'read_audit',arguments:{workspaceId:workspace}})).isError).toBe(true);
  await db.pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,role) VALUES($1,$2,'admin')",[workspace,identity]);
  await tokens.revoke(workspace,identity,issued.id);
  const revoked=await client.callTool({name:'list_incidents',arguments:{workspaceId:workspace}});expect(revoked.isError).toBe(true);expect(JSON.stringify(revoked)).not.toContain(issued.token);
  const expired=await tokens.issue(workspace,identity,'Expiry acceptance');
  await db.inWorkspace(workspace,c=>c.query("UPDATE mcp_access_tokens SET expires_at=created_at+interval '1 millisecond' WHERE id=$1",[expired.id]));
  await new Promise(resolve=>setTimeout(resolve,5));expect(await tokens.authorize(workspace,expired.token)).toBeNull();
  const localDirectory=join(directory,'local');
  expect((await prepareLocalCredential(db,workspace,identity,localDirectory)).reused).toBe(false);
  const priorLocalToken=(await readFile(join(localDirectory,'token'),'utf8')).trim();
  expect((await prepareLocalCredential(db,workspace,identity,localDirectory)).reused).toBe(true);
  await unlink(join(localDirectory,'token'));
  await expect(prepareLocalCredential(db,workspace,identity,localDirectory)).rejects.toThrow('Partial MCP setup');
  expect(await tokens.authorize(workspace,priorLocalToken)).not.toBeNull();
  await prepareLocalCredential(db,workspace,identity,localDirectory,true);
  expect(await tokens.authorize(workspace,priorLocalToken)).toBeNull();
 }finally{await client?.close();await rm(directory,{recursive:true,force:true});await db.close();}
},30000);
