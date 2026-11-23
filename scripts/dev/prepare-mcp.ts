import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SentinelDatabase } from '@sentinel/db';
import { prepareLocalCredential } from '../../packages/mcp-read/src/local-credential';

loadEnvFile('.local/compose.env');
const owner=JSON.parse(await readFile('.local/owner.json','utf8'));
const directory=resolve('.local/mcp');
const db=new SentinelDatabase(`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD!)}@127.0.0.1:55441/sentinel`);
try{
 const identity=(await db.pool.query('SELECT id FROM identities WHERE issuer=$1 AND subject=$2',[owner.issuer,owner.subject])).rows[0];
 if(!identity)throw new Error('Bootstrap the local owner before preparing MCP.');
 const result=await prepareLocalCredential(db,owner.workspaceId,identity.id,directory,process.argv.includes('--rotate'));
 console.log(result.reused?'Existing local MCP credential preserved. Configuration: .local/mcp/config.json':'Local MCP credential prepared for seven days. Private files: .local/mcp/token and .local/mcp/config.json');
}finally{await db.close();}
