import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { parseEcsServiceArn } from './ecs-read';

export async function readEcsMetrics(serviceArn: string, roleArn: string, until: Date) {
 const target = parseEcsServiceArn(serviceArn);
 const client = new CloudWatchClient({
  region: target.region,
  maxAttempts: 2,
  credentials: fromTemporaryCredentials({
   clientConfig: { region: target.region },
   params: { RoleArn: roleArn, RoleSessionName: 'sentinel-metrics', DurationSeconds: 900 },
  }),
 });
 try {
  const signal = AbortSignal.timeout(12000);
  const start = new Date(until.getTime() - 3600000);
  const metrics = await Promise.all(['CPUUtilization', 'MemoryUtilization'].map(async metric => {
   const response = await client.send(new GetMetricStatisticsCommand({
    Namespace: 'AWS/ECS', MetricName: metric, Period: 300, Statistics: ['Average'],
    StartTime: start, EndTime: until,
    Dimensions: [
     { Name: 'ClusterName', Value: target.clusterArn.split('/').at(-1) },
     { Name: 'ServiceName', Value: target.serviceName },
    ],
   }), { abortSignal: signal });
   const points = (response.Datapoints ?? []).flatMap(point =>
    point.Timestamp && Number.isFinite(point.Average)
     ? [{ timestamp: point.Timestamp.toISOString(), average: point.Average }] : []);
   return { metric, points: points.sort((a,b) => a.timestamp.localeCompare(b.timestamp)) };
  }));
  return { serviceArn, start: start.toISOString(), end: until.toISOString(), metrics };
 } finally {
  client.destroy();
 }
}
