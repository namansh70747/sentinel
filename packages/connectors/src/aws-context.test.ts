import { expect, it } from 'vitest';
import { isRegionalBackupResource } from './aws-context';

it('allows explicitly mapped regional resources and rejects ECS, other accounts and regions', () => {
 const target={accountId:'123456789012',region:'ap-southeast-2'};
 const arn='arn:aws:rds:ap-southeast-2:123456789012:db:storefront';
 expect(isRegionalBackupResource(arn,target)).toBe(true);
 expect(isRegionalBackupResource(arn.replace(':db:',':snapshot:'),target)).toBe(false);
 expect(isRegionalBackupResource(arn.replace('ap-southeast-2','us-east-1'),target)).toBe(false);
 expect(isRegionalBackupResource(arn.replace('123456789012','999999999999'),target)).toBe(false);
 expect(isRegionalBackupResource('arn:aws:ecs:ap-southeast-2:123456789012:service/cluster/storefront',target)).toBe(false);
});
