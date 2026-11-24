import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
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
  const start = new Date(until.getTime() - 3600000);
  const dimensions = [
   { Name: 'ClusterName', Value: target.clusterArn.split('/').at(-1) },
   { Name: 'ServiceName', Value: target.serviceName },
  ];
  const queries = [
   { id: 'cpu', metric: 'CPUUtilization' },
   { id: 'memory', metric: 'MemoryUtilization' },
  ];
  const response = await client.send(new GetMetricDataCommand({
   StartTime: start,
   EndTime: until,
   ScanBy: 'TimestampAscending',
   MaxDatapoints: 100,
   MetricDataQueries: queries.map(({id, metric}) => ({
    Id: id,
    MetricStat: {
     Metric: { Namespace: 'AWS/ECS', MetricName: metric, Dimensions: dimensions },
     Period: 300,
     Stat: 'Average',
    },
   })),
  }), { abortSignal: AbortSignal.timeout(12000) });

  const metrics = queries.map(({id, metric}) => {
   const result = response.MetricDataResults?.find(row => row.Id === id);
   const status = result?.StatusCode;
   if (status === 'Forbidden') throw Object.assign(new Error('CloudWatch query denied'), {name:'AccessDenied'});
   if (!result || (status !== 'Complete' && status !== 'PartialData')) throw new Error('CloudWatch metric query failed');
   const values = result.Values ?? [];
   const timestamps = result.Timestamps ?? [];
   if (timestamps.length !== values.length || values.some(value => !Number.isFinite(value))) throw new Error('Malformed CloudWatch metric response');
   const points = timestamps.map((timestamp, index) => ({timestamp:timestamp.toISOString(), average:values[index]}));
   return {metric, points, partial:status === 'PartialData' || Boolean(response.NextToken)};
  });
  return {serviceArn, start: start.toISOString(), end: until.toISOString(), metrics};
 } finally {
  client.destroy();
 }
}
