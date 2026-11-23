import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SentinelDatabase } from '@sentinel/db';
import { McpTokenRepository } from '@sentinel/db/mcp-tokens';
import { createReadServer } from './server';

let database:SentinelDatabase|undefined;
let closing:Promise<void>|undefined;
const closeDatabase=()=>closing??=(database?.close()??Promise.resolve());
try{
 const workspace=process.env.SENTINEL_MCP_WORKSPACE_ID,file=process.env.SENTINEL_MCP_TOKEN_FILE,url=process.env.DATABASE_URL;
 if(!workspace||!file||!url)throw new Error('Missing configuration');
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 let token:string;
 try{const stat=await handle.stat();if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>128||process.getuid&&stat.uid!==process.getuid())throw new Error('Private credential file required');token=(await handle.readFile('utf8')).trim();}finally{await handle.close();}
 database=new SentinelDatabase(url);
 if(!await new McpTokenRepository(database).authorize(workspace,token))throw new Error('Credential denied');
 const server=createReadServer(database,workspace,token);
 server.server.onclose=()=>{void closeDatabase();};
 await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:65536}));
 process.stdin.once('end',()=>{void server.close().finally(closeDatabase);});
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void server.close().finally(closeDatabase).finally(()=>process.exit(0));});
}catch{
 console.error('Sentinel MCP could not start. Check database availability and the private workspace credential file.');
 await closeDatabase();process.exitCode=1;
}
