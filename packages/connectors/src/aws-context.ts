import { BackupClient, ListRecoveryPointsByResourceCommand } from '@aws-sdk/client-backup';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

interface Target { accountId:string; region:string; readRoleArn:string }
function credentials(target:Target) {
 return fromTemporaryCredentials({
  clientConfig:{region:target.region},
  params:{RoleArn:target.readRoleArn,RoleSessionName:'sentinel-context',DurationSeconds:900},
 });
}

export function isRegionalBackupResource(arn:string, target:Pick<Target,'accountId'|'region'>) {
 const match=/^arn:aws:(rds|dynamodb|elasticfilesystem|ec2):([a-z0-9-]+):(\d{12}):(.+)$/.exec(arn);
 if(!match||match[2]!==target.region||match[3]!==target.accountId)return false;
 const patterns:Record<string,RegExp>={
  rds:/^(db|cluster):[a-zA-Z0-9-]+$/,
  dynamodb:/^table\/[a-zA-Z0-9_.-]+$/,
  elasticfilesystem:/^file-system\/fs-[a-f0-9]+$/,
  ec2:/^(instance\/i-|volume\/vol-)[a-f0-9]+$/,
 };
 return patterns[match[1]].test(match[4]);
}

export function linkedAccountCostFilter(accountId:string) {
 if(!/^\d{12}$/.test(accountId)||accountId==='000000000000')throw new Error('An approved linked account is required');
 return {Dimensions:{Key:'LINKED_ACCOUNT' as const,Values:[accountId]}};
}

export function readTaggedCost(target:Target,key:string,value:string,now:Date) {
 return readCost(target,now,{key,value});
}

export function readLinkedAccountCost(target:Target,now:Date) {
 return readCost(target,now);
}

async function readCost(target:Target,now:Date,tag?:{key:string;value:string}) {
 const accountFilter=linkedAccountCostFilter(target.accountId);
 const end=now.toISOString().slice(0,10);
 const start=new Date(Date.parse(end)-7*86400000).toISOString().slice(0,10);
 const client=new CostExplorerClient({region:'us-east-1',credentials:credentials(target),maxAttempts:2});
 try {
  const response=await client.send(new GetCostAndUsageCommand({
   TimePeriod:{Start:start,End:end},Granularity:'DAILY',Metrics:['UnblendedCost'],
   Filter:tag?{And:[accountFilter,{Tags:{Key:tag.key,Values:[tag.value],MatchOptions:['EQUALS','CASE_SENSITIVE']}}]}:accountFilter,
  }),{abortSignal:AbortSignal.timeout(12000)});
  const days=(response.ResultsByTime??[]).flatMap(row=>{
   const cost=row.Total?.UnblendedCost;
   const date=row.TimePeriod?.Start;
   if(!cost?.Amount||!cost.Unit||!Number.isFinite(Number(cost.Amount))||!date||date<start||date>=end)return [];
   return [{date,amount:cost.Amount,currency:cost.Unit,estimated:row.Estimated===true}];
  });
  return {scope:tag?'tagged-account-cost':'linked-account-cost',start,end,...(tag?{tagKey:tag.key,tagValue:tag.value}:{}),days,partial:!!response.NextPageToken||(days.length>0&&new Set(days.map(day=>day.date)).size!==7)};
 }finally{client.destroy();}
}

export async function readRecoveryPoints(target:Target,resourceArn:string) {
 if(!isRegionalBackupResource(resourceArn,target))throw new Error('Backup resource is outside the approved account, region or resource types');
 const client=new BackupClient({region:target.region,credentials:credentials(target),maxAttempts:2});
 try{
  const response=await client.send(new ListRecoveryPointsByResourceCommand({ResourceArn:resourceArn,MaxResults:20}),{abortSignal:AbortSignal.timeout(12000)});
  const recoveryPoints=(response.RecoveryPoints??[]).map(row=>({
   createdAt:row.CreationDate?.toISOString()??null,status:row.Status??null,
   vault:row.BackupVaultName??null,
  }));
  return {scope:'backup-inventory',resourceArn,recoveryPoints,partial:!!response.NextToken,restoreVerified:false};
 }finally{client.destroy();}
}
