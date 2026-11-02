import {expect,it,vi} from 'vitest';
import type {ECSClient} from '@aws-sdk/client-ecs';
import {EcsReadClient,parseEcsServiceArn} from './ecs-read';
const arn='arn:aws:ecs:us-east-1:123456789012:service/store/web';
const config={region:'us-east-1',accountId:'123456789012',readRoleArn:'arn:aws:iam::123456789012:role/SentinelRead'};
it('rejects account and region mismatches before contacting AWS',async()=>{
 const send=vi.fn();const client=new EcsReadClient(config,{send} as unknown as Pick<ECSClient,'send'>);
 await expect(client.observe(arn.replace('123456789012','999999999999'))).rejects.toThrow('outside');
 await expect(client.observe(arn.replace('us-east-1','eu-west-1'))).rejects.toThrow('outside');
 expect(send).not.toHaveBeenCalled();
 expect(()=>parseEcsServiceArn('arn:aws:ecs:us-east-1:123456789012:service/web')).toThrow('long service ARN');
});
it('records observed ECS state and rejects partial failures',async()=>{
 const send=vi.fn().mockResolvedValueOnce({services:[{serviceArn:arn,status:'ACTIVE',runningCount:2,desiredCount:2,deployments:[]}]}).mockResolvedValueOnce({services:[],failures:[{reason:'MISSING'}]});
 const client=new EcsReadClient(config,{send} as unknown as Pick<ECSClient,'send'>);
 expect((await client.observe(arn)).runningCount).toBe(2);
 await expect(client.observe(arn)).rejects.toThrow('could not be verified');
});
