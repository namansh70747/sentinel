import { ECSClient,DescribeServicesCommand } from '@aws-sdk/client-ecs';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
export function parseEcsServiceArn(arn:string) {
 const match=/^arn:(aws(?:-[a-z]+)*):ecs:([a-z0-9-]+):(\d{12}):service\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(arn);
 if(!match)throw new Error('An ECS long service ARN is required');
 return {partition:match[1],region:match[2],accountId:match[3],clusterArn:`arn:${match[1]}:ecs:${match[2]}:${match[3]}:cluster/${match[4]}`,serviceName:match[5]};
}
export class EcsReadClient {
 private readonly client:Pick<ECSClient,'send'>;
 constructor(private readonly config:{region:string;accountId:string;readRoleArn:string},client?:Pick<ECSClient,'send'>) {
  if(!/^arn:aws(?:-[a-z]+)*:iam::\d{12}:role\/.+$/.test(config.readRoleArn)||config.readRoleArn.split(':')[4]!==config.accountId)throw new Error('Read role must belong to the catalogued AWS account');
  this.client=client??new ECSClient({region:config.region,maxAttempts:2,credentials:fromTemporaryCredentials({clientConfig:{region:config.region},params:{RoleArn:config.readRoleArn,RoleSessionName:'sentinel-read',DurationSeconds:900}})});
 }
 async observe(serviceArn:string) {
  const parsed=parseEcsServiceArn(serviceArn);
  if(parsed.region!==this.config.region||parsed.accountId!==this.config.accountId)throw new Error('Service is outside configured account or region');
  const response=await this.client.send(new DescribeServicesCommand({cluster:parsed.clusterArn,services:[serviceArn]}),{abortSignal:AbortSignal.timeout(10000)});
  if(response.failures?.length||response.services?.length!==1||response.services[0].serviceArn!==serviceArn)throw new Error('ECS service could not be verified');
  const service=response.services[0];
  return {serviceArn,clusterArn:parsed.clusterArn,observedAt:new Date().toISOString(),status:service.status??'UNKNOWN',desiredCount:service.desiredCount??null,runningCount:service.runningCount??null,pendingCount:service.pendingCount??null,taskDefinition:service.taskDefinition??null,deployments:(service.deployments??[]).map(row=>({id:row.id??null,status:row.status??null,taskDefinition:row.taskDefinition??null,rolloutState:row.rolloutState??null,createdAt:row.createdAt?.toISOString()??null})),events:(service.events??[]).slice(0,20).map(event=>({id:event.id??null,at:event.createdAt?.toISOString()??null,message:event.message??''}))};
 }
}
