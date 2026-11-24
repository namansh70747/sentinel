import {expect,it,vi} from 'vitest';
import {readCloudWatchLogSummary} from './cloudwatch-logs';

it('continues through empty pages and saves only bounded log metadata',async()=>{
 const send=vi.fn().mockResolvedValueOnce({events:[],nextToken:'page-two'}).mockResolvedValueOnce({
  events:[{timestamp:600000,message:'private payload'}],
 });
 const result=await readCloudWatchLogSummary({region:'ap-southeast-2',readRoleArn:'role'},'/ecs/storefront-task','ecs/storefront-web/',new Date(900000),{send});
 expect(result).toMatchObject({eventCount:1,partial:false,observedAt:new Date(600000).toISOString()});
 expect(send.mock.calls[1][0].input).toMatchObject({logGroupName:'/ecs/storefront-task',logStreamNamePrefix:'ecs/storefront-web/',nextToken:'page-two'});
 expect(JSON.stringify(result)).not.toContain('private payload');
});
