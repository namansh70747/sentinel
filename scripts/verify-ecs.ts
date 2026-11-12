import { loadEnvFile } from 'node:process';
try { loadEnvFile(new URL('../.env', import.meta.url)); } catch {}
import { EcsReadClient } from '../packages/connectors/src/ecs-read';

async function main() {
  const config = {
    region: 'ap-southeast-2',
    accountId: '110144245794',
    readRoleArn: 'arn:aws:iam::110144245794:role/SentinelReadRole',
  };

  const arn = 'arn:aws:ecs:ap-southeast-2:110144245794:service/sentinel-cluster/storefront-service';

  console.log('Connecting to AWS ECS via Sentinel EcsReadClient...');
  console.log('Config:', config);
  console.log('Target ARN:', arn);

  const client = new EcsReadClient(config);
  const result = await client.observe(arn);

  console.log('\n SUCCESS! Sentinel successfully observed live AWS ECS service:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('\n Error observing ECS service:', err);
  process.exit(1);
});
