import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

export async function readCloudWatchLogSummary(
 target: {region:string;readRoleArn:string},
 logGroupName: string,
 logStreamNamePrefix: string,
 until: Date,
 transport?: Pick<CloudWatchLogsClient,'send'>,
) {
 const client=transport??new CloudWatchLogsClient({
  region:target.region,maxAttempts:1,
  credentials:fromTemporaryCredentials({
   clientConfig:{region:target.region},
   params:{RoleArn:target.readRoleArn,RoleSessionName:'sentinel-logs',DurationSeconds:900},
  }),
 });
 const endTime=until.getTime(),startTime=endTime-24*60*60_000;
 const abortSignal=AbortSignal.timeout(12000);
 let nextToken:string|undefined,eventCount=0,latest:number|undefined;
 try {
  for(let page=0;page<3;page++){
   const response=await client.send(new FilterLogEventsCommand({logGroupName,logStreamNamePrefix,startTime,endTime,limit:50,nextToken}),{abortSignal});
   for(const event of response.events??[]){
    eventCount++;
    if(typeof event.timestamp==='number'&&Number.isFinite(event.timestamp))latest=Math.max(latest??event.timestamp,event.timestamp);
   }
   if(!response.nextToken){nextToken=undefined;break;}
   if(response.nextToken===nextToken)break;
   nextToken=response.nextToken;
  }
  return {logGroupName,logStreamNamePrefix,start:new Date(startTime).toISOString(),end:until.toISOString(),eventCount,partial:Boolean(nextToken),observedAt:latest===undefined?null:new Date(latest).toISOString()};
 }finally{
  if(client instanceof CloudWatchLogsClient)client.destroy();
 }
}
