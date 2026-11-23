import { constants } from 'node:fs';
import { open,mkdir,writeFile,rename,rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SentinelDatabase } from '@sentinel/db';
import { McpTokenRepository } from '@sentinel/db/mcp-tokens';

async function privateText(path:string){
 let file;try{file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 try{const stat=await file.stat();if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>4096||process.getuid&&stat.uid!==process.getuid())throw new Error('Private MCP files required');return await file.readFile('utf8');}finally{await file.close();}
}
async function replacePrivate(path:string,value:string){const temporary=path+'.'+randomUUID();await writeFile(temporary,value,{mode:0o600,flag:'wx'});await rename(temporary,path);}

export async function prepareLocalCredential(db:SentinelDatabase,workspaceId:string,identityId:string,directory:string,rotate=false){
 await mkdir(directory,{recursive:true,mode:0o700});
 const lock=join(directory,'.prepare-lock');await mkdir(lock,{mode:0o700});
 try{
  const tokenFile=join(directory,'token'),configFile=join(directory,'config.json'),tokens=new McpTokenRepository(db);
  const [rawToken,rawConfig]=await Promise.all([privateText(tokenFile),privateText(configFile)]);
  const config=rawConfig===null?null:JSON.parse(rawConfig) as {workspaceId:string;credentialId:string;expiresAt:string};
  if(config&&(config.workspaceId!==workspaceId||!config.credentialId))throw new Error('MCP configuration belongs to a different workspace or is invalid.');
  if((rawToken===null)!==(config===null)&&!rotate)throw new Error('Partial MCP setup detected. Run preparation with --rotate to revoke old credentials and recover.');
  const active=rawToken===null?null:await tokens.authorize(workspaceId,rawToken.trim());
  if(rawToken!==null&&config&&!rotate){
   if(!active||active.id!==config.credentialId||active.identity_id!==identityId)throw new Error('MCP credential expired, revoked or mismatched. Use --rotate.');
   return {reused:true,expiresAt:config.expiresAt};
  }
  if(rotate){for(const id of new Set([config?.credentialId,active?.id].filter((id):id is string=>Boolean(id))))await tokens.revoke(workspaceId,identityId,id);}
  const issued=await tokens.issue(workspaceId,identityId,'Local STDIO client');
  await replacePrivate(tokenFile,issued.token+'\n');
  await replacePrivate(configFile,JSON.stringify({workspaceId,credentialId:issued.id,expiresAt:issued.expiresAt},null,2)+'\n');
  return {reused:false,expiresAt:issued.expiresAt};
 }finally{await rmdir(lock);}
}
