import { loadEnvFile } from 'node:process';
import { readFile, writeFile, open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SentinelDatabase } from '@sentinel/db';
import { ConnectorRepository } from '@sentinel/db/connectors';
import { SecretVault } from '@sentinel/connectors/secrets';
import { parseBinding } from '@sentinel/connectors/config';

loadEnvFile('.env');
loadEnvFile('.local/compose.env');
const mapping=parseBinding('ecs',{
 serviceArn:process.env.SENTINEL_ECS_SERVICE_ARN,readRoleArn:process.env.SENTINEL_READ_ROLE_ARN,
 costScope:process.env.SENTINEL_AWS_COST_SCOPE||undefined,serviceProfile:process.env.SENTINEL_AWS_SERVICE_PROFILE||undefined,
 logGroupName:process.env.SENTINEL_CLOUDWATCH_LOG_GROUP||undefined,logStreamPrefix:process.env.SENTINEL_CLOUDWATCH_LOG_STREAM_PREFIX||undefined,
 costTagKey:process.env.SENTINEL_COST_TAG_KEY||undefined,costTagValue:process.env.SENTINEL_COST_TAG_VALUE||undefined,backupResourceArn:process.env.SENTINEL_BACKUP_RESOURCE_ARN||undefined,
});
const {serviceArn,readRoleArn}=mapping;
const [, , , region,account]=String(serviceArn).split(':');
const owner=JSON.parse(await readFile('.local/owner.json','utf8'));
const db=new SentinelDatabase(`postgres://sentinel_app:${encodeURIComponent(process.env.SENTINEL_DATABASE_PASSWORD!)}@127.0.0.1:55441/sentinel`);
try {
 const credentials=new ConnectorRepository(db,await SecretVault.fromFile('.local/connector-key'));
 const workspace=owner.workspaceId;
 const actor=(await db.pool.query("SELECT i.id FROM identities i JOIN workspace_memberships m ON m.identity_id=i.id WHERE i.issuer=$1 AND i.subject=$2 AND m.workspace_id=$3 AND m.role='admin'",[owner.issuer,owner.subject,workspace])).rows[0]?.id;
 if(!actor)throw new Error('Local workspace administrator missing');
 const service=await db.inWorkspace(workspace,async client=>{
  const existing=(await client.query('SELECT id FROM services WHERE workspace_id=$1 AND resource_arn=$2 AND region=$3 AND account_id=$4',[workspace,serviceArn,region,account])).rows[0];
  if(existing)return existing.id;
  const id=randomUUID();
  await client.query('INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspace,id,'Sydney ECS '+String(serviceArn).split('/').at(-1),'local-operator',account,region,serviceArn]);
  return id;
 });
 const existing=(await credentials.bindings(workspace,service)).find(row=>row.provider==='ecs');
 const connector=existing?await credentials.get(workspace,existing.connectorId):await credentials.create(workspace,actor,{provider:'ecs',name:'Sydney ECS read role',mode:'live',config:{}},{});
 if(!connector||connector.mode!=='live')throw new Error('Existing ECS connection is disabled');
 if(existing&&(existing.mapping.serviceArn!==serviceArn||existing.mapping.readRoleArn!==readRoleArn))throw new Error('Existing ECS binding differs from the approved configuration');
 if(!existing||['costTagKey','costTagValue','backupResourceArn','logGroupName','logStreamPrefix','costScope','serviceProfile'].some(key=>existing.mapping[key]!==mapping[key]))await credentials.bind(workspace,actor,service,'ecs',connector.id,connector.configVersion,mapping);
 const keys=[['aws_access_key_id',process.env.AWS_ACCESS_KEY_ID],['aws_secret_access_key',process.env.AWS_SECRET_ACCESS_KEY],['aws_session_token',process.env.AWS_SESSION_TOKEN]] as const;
 if(!keys[0][1]||!keys[1][1]||keys.some(([,value])=>value&&/[\r\n]/.test(value)))throw new Error('Valid AWS source credentials are required');
 const path='.local/aws-read-credentials';
 const profile='[sentinel]\n'+keys.filter(([,value])=>value).map(([key,value])=>key+'='+value).join('\n')+'\n';
 let previous:string|undefined;
 const existingFile=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW).catch(error=>{
  if(error.code==='ENOENT')return null;
  throw error;
 });
 if(existingFile){
  try{
   const info=await existingFile.stat();
   if(!info.isFile()||(info.mode&0o777)!==0o600||info.size>16384||(process.getuid&&info.uid!==process.getuid()))throw new Error('AWS credentials must be a private regular file owned by the operator');
   previous=await existingFile.readFile('utf8');
  }finally{await existingFile.close();}
 }
 if(previous===undefined)await writeFile(path,profile,{mode:0o600,flag:'wx'});
 else if(previous!==profile){
  if(!process.argv.includes('--rotate'))throw new Error('Private AWS credentials differ from .env. Use --rotate to replace them explicitly.');
  const temp=path+'.'+randomUUID();
  await writeFile(temp,profile,{mode:0o600,flag:'wx'});
  try{await rename(temp,path);}finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }

 const optional=['SENTINEL_COST_TAG_KEY','SENTINEL_COST_TAG_VALUE','SENTINEL_BACKUP_RESOURCE_ARN','SENTINEL_CLOUDWATCH_LOG_GROUP','SENTINEL_CLOUDWATCH_LOG_STREAM_PREFIX','SENTINEL_AWS_COST_SCOPE','SENTINEL_AWS_SERVICE_PROFILE'].map(key=>{
  const value=process.env[key]?.trim();
  if(!value)return '';
  if(value.length>512||/['\r\n\0]/.test(value))throw new Error('Invalid AWS context configuration: '+key);
  return key+"='"+value+"'\n";
 }).join('');
 const metadata='.local/aws-live.env';
 const metadataTemp=metadata+'.'+randomUUID();
 await writeFile(metadataTemp,`SENTINEL_ECS_SERVICE_ARN=${serviceArn}\nSENTINEL_READ_ROLE_ARN=${readRoleArn}\n`+optional,{mode:0o600,flag:'wx'});
 try{await rename(metadataTemp,metadata);}finally{await unlink(metadataTemp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 console.log(JSON.stringify({workspaceId:workspace,serviceId:service,connectorId:connector.id}));
}finally{await db.close();}
