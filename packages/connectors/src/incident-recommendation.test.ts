import { expect, it } from 'vitest';
import { recommendIncidentStep } from './incident-recommendation';

it('prioritizes failed live checks over pending setup and rejects invented model choices', async () => {
 const step = await recommendIncidentStep('escalated', [
  {source:'cost',outcome:'not-configured',provenance:null},
  {source:'ecs',outcome:'unavailable',provenance:null},
  {source:'cloudwatch',outcome:'unavailable',provenance:null},
 ], async () => 'cost');
 expect(step).toMatch(/AWS service status/);
});

it('accepts a model ranking only among equally relevant approved checks', async () => {
 const step = await recommendIncidentStep('escalated', [
  {source:'ecs',outcome:'unavailable',provenance:null},
  {source:'cloudwatch',outcome:'unavailable',provenance:null},
 ], async () => 'cloudwatch');
 expect(step).toMatch(/CPU and memory/);
});

it('distinguishes missing configuration from a service failure', async () => {
 const step = await recommendIncidentStep('escalated', [
  {source:'ecs',outcome:'ok',provenance:'live'},
  {source:'prometheus',outcome:'not-configured',provenance:null},
 ]);
 expect(step).toMatch(/Connect request monitoring/);
});

it('links the selected action to evidence and excludes simulated observations', async () => {
 const { buildIncidentAdvisory } = await import('./incident-recommendation');
 const advisory = buildIncidentAdvisory('escalated', [
  {source:'ecs',outcome:'unavailable',provenance:'simulated',attempt_id:'historical'},
  {source:'prometheus',outcome:'not-configured',provenance:null,attempt_id:'current'},
 ]);
 expect(advisory.actionIds).toEqual(['setup:prometheus']);
 expect(advisory.evidenceRefs).toEqual(['current']);
});

it('puts missing required request monitoring before optional billing access', async () => {
 const step = await recommendIncidentStep('escalated', [
  {source:'cost',outcome:'denied',provenance:'live'},
  {source:'prometheus',outcome:'not-configured',provenance:null},
 ]);
 expect(step).toMatch(/Connect request monitoring/);
});

it('publishes an evidence-linked model advisory only for an allowed source', async () => {
 const { finalizeModelAdvisory } = await import('./incident-recommendation');
 const evidence = [{source:'prometheus',outcome:'not-configured',provenance:null,attempt_id:'request-check'}];
 expect(finalizeModelAdvisory('escalated',evidence,'cost','ollama')).toBeNull();
 expect(finalizeModelAdvisory('escalated',evidence,'prometheus','ollama')).toMatchObject({
  mode:'model-assisted',provider:'ollama',evidenceRefs:['request-check'],actionIds:['setup:prometheus'],
  explanation:'Request health monitoring is not connected for this service.',
 });
});
