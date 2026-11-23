// Launch directly with node (or npm --silent); stdout belongs to MCP JSON-RPC.
import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
try{
 loadEnvFile('.local/compose.env');
 const config=JSON.parse(await readFile('.local/mcp/config.json','utf8'));
 const child=spawn(process.execPath,['--import','tsx','packages/mcp-read/src/main.ts'],{stdio:'inherit',env:{...process.env,DATABASE_URL:`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD)}@127.0.0.1:55441/sentinel`,SENTINEL_MCP_WORKSPACE_ID:config.workspaceId,SENTINEL_MCP_TOKEN_FILE:resolve('.local/mcp/token')}});
 child.on('error',()=>{console.error('Could not start local MCP process.');process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code??1;});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
}catch{console.error('Local MCP is not prepared. Run npm run dev:prepare-mcp after Docker startup.');process.exitCode=1;}
