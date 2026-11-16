import { loadEnvFile } from 'node:process';
try { loadEnvFile(new URL('../.env', import.meta.url)); } catch {}
import { EcsReadClient } from '../packages/connectors/src/ecs-read';

const region = process.env.AWS_REGION ?? '';
const accountId = process.env.SENTINEL_AWS_ACCOUNT_ID ?? '';
const readRoleArn = process.env.SENTINEL_READ_ROLE_ARN ?? '';
const serviceArn = process.env.SENTINEL_ECS_SERVICE_ARN ?? '';
if (!region || !accountId || !readRoleArn || !serviceArn) {
 console.error('Set AWS_REGION, SENTINEL_AWS_ACCOUNT_ID, SENTINEL_READ_ROLE_ARN, and SENTINEL_ECS_SERVICE_ARN');
 process.exit(1);
}
const client = new EcsReadClient({ region, accountId, readRoleArn });
const result = await client.observe(serviceArn);
console.log(JSON.stringify(result, null, 2));
