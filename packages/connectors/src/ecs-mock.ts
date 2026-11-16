/** Synthetic, credential-free ECS adapter. Never imports or invokes the AWS SDK. */
export type MockScenario = 'healthy' | 'deployment' | 'aws-error' | 'stale';
export const MOCK_SERVICE_ARN = 'arn:aws:ecs:ap-south-1:000000000000:service/sentinel-demo/checkout-api';
export class MockEcsReadClient {
  constructor(readonly scenario: MockScenario = 'deployment', private readonly now = () => new Date()) {}
  async observe(serviceArn: string = MOCK_SERVICE_ARN) {
    if (serviceArn !== MOCK_SERVICE_ARN) throw new Error('Mock reader accepts only the fictional demo service');
    if (this.scenario === 'aws-error') throw new Error('Simulated AccessDenied: ECS read role is unavailable. No AWS request was made.');
    const at = this.now();
    const observedAt = new Date(at.getTime() - (this.scenario === 'stale' ? 25 * 60_000 : 0)).toISOString();
    const degraded = this.scenario === 'deployment';
    return {
      source: 'mock' as const, simulated: true as const, serviceArn,
      clusterArn: 'arn:aws:ecs:ap-south-1:000000000000:cluster/sentinel-demo',
      observedAt, status: 'ACTIVE', desiredCount: 3, runningCount: degraded ? 1 : 3,
      pendingCount: degraded ? 2 : 0,
      taskDefinition: 'arn:aws:ecs:ap-south-1:000000000000:task-definition/checkout-api:42',
      deployments: [{id:'synthetic-deployment-42',status:'PRIMARY',taskDefinition:'checkout-api:42',rolloutState:degraded?'IN_PROGRESS':'COMPLETED',createdAt:new Date(at.getTime()-8*60_000).toISOString()}],
      events: [{id:'synthetic-event-1',at:observedAt,message:degraded?'Synthetic event: two tasks failed load balancer health checks.':'Synthetic event: service reached a steady state.'}],
    };
  }
}
