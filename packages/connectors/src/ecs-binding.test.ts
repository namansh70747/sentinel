import { expect, it } from 'vitest';
import { parseBinding } from './config';

it('rejects fixture accounts, short service ARNs, and cross-account read roles', () => {
 const serviceArn = 'arn:aws:ecs:ap-southeast-2:123456789012:service/cluster/checkout';
 const readRoleArn = 'arn:aws:iam::123456789012:role/sentinel-read';
 expect(parseBinding('ecs', { serviceArn, readRoleArn })).toEqual({ serviceArn, readRoleArn });
 expect(() => parseBinding('ecs', { serviceArn: serviceArn.replace('/cluster', ''), readRoleArn })).toThrow();
 expect(() => parseBinding('ecs', { serviceArn, readRoleArn: readRoleArn.replace('123456789012','999999999999') })).toThrow();
 expect(() => parseBinding('ecs', {
  serviceArn: serviceArn.replace('123456789012','000000000000'),
  readRoleArn: readRoleArn.replace('123456789012','000000000000'),
 })).toThrow();
});

it('retains optional AWS context scope on the service mapping', () => {
 const mapping={
  serviceArn:'arn:aws:ecs:ap-southeast-2:123456789012:service/cluster/checkout',
  readRoleArn:'arn:aws:iam::123456789012:role/sentinel-read',
  costTagKey:'Application',
  costTagValue:'checkout',
  backupResourceArn:'arn:aws:rds:ap-southeast-2:123456789012:db:checkout',
 };
 expect(parseBinding('ecs',mapping)).toEqual(mapping);
 expect(()=>parseBinding('ecs',{...mapping,costTagValue:'checkout\nother'})).toThrow();
});
