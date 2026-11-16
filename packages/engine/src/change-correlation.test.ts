import {describe,expect,it} from 'vitest';
import {correlateEcsChange,type DeploymentObservation} from './change-correlation';
const now=Date.parse('2026-11-02T12:00:00Z');
const openedAt=new Date(now-10000).toISOString();
const observation:DeploymentObservation={taskDefinition:'web:2',observedAt:new Date(now).toISOString(),deployments:[{status:'PRIMARY',taskDefinition:'web:2',createdAt:new Date(now-60000).toISOString()},{status:'ACTIVE',taskDefinition:'web:1',createdAt:new Date(now-7200000).toISOString()}]};
describe('ECS change correlation',()=>{
 it('identifies a recent change only as a candidate',()=>{
  const result=correlateEcsChange(observation,'sev1',now,openedAt);
  expect(result.status).toBe('candidate');expect(result.previousRevision).toBe('web:1');expect(result.explanation).toContain('not proof');
 });
 it('refuses stale data, no impact, old changes and ambiguous previous revisions',()=>{
  expect(correlateEcsChange({...observation,observedAt:new Date(now-121000).toISOString()},'sev1',now,openedAt).status).toBe('unknown');
  expect(correlateEcsChange(observation,'sev4',now,openedAt).status).toBe('unknown');
  expect(correlateEcsChange({...observation,deployments:[{...observation.deployments[0],createdAt:new Date(now-5000).toISOString()},observation.deployments[1]]},'sev1',now,openedAt).status).toBe('unknown');
  expect(correlateEcsChange({...observation,deployments:[{...observation.deployments[0],createdAt:new Date(now-1810001).toISOString()},observation.deployments[1]]},'sev1',now,openedAt).status).toBe('unknown');
  expect(correlateEcsChange({...observation,deployments:[...observation.deployments,{status:'ACTIVE',taskDefinition:'web:0',createdAt:null}]},'sev1',now,openedAt).status).toBe('unknown');
  expect(correlateEcsChange({...observation,provenance:'simulated'},'sev1',now,openedAt)).toEqual({status:'unknown',explanation:'Simulated observation is not a change lead.'});
 });
});
