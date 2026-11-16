export interface DeploymentObservation {
 taskDefinition:string|null;
 observedAt:string;
 deployments:{status:string|null;taskDefinition:string|null;createdAt:string|null}[];
}
export interface ChangeHypothesis {
 status:'candidate'|'unknown';
 explanation:string;
 currentRevision?:string;
 previousRevision?:string;
 changedAt?:string;
}
/** Correlation is an investigative lead only. It never authorizes or proves a rollback. */
export function correlateEcsChange(observation:DeploymentObservation & { provenance?: 'live' | 'simulated' }, severity:string, now:number, incidentOpenedAt:string):ChangeHypothesis {
 const unknown=(explanation:string):ChangeHypothesis=>({status:'unknown',explanation});
 if(observation.provenance==='simulated')return unknown('Simulated observation is not a change lead.');
 const observed=Date.parse(observation.observedAt);
 if(!Number.isFinite(observed)||observed<now-120000||observed>now+30000)return unknown('ECS observation is stale or has an invalid timestamp.');
 if(!['sev1','sev2','sev3'].includes(severity))return unknown('No observed user-impact breach to correlate.');
 const primary=observation.deployments.filter(item=>item.status==='PRIMARY');
 if(primary.length!==1||!primary[0].taskDefinition||primary[0].taskDefinition!==observation.taskDefinition)return unknown('Current ECS deployment could not be identified unambiguously.');
 const openedAt=Date.parse(incidentOpenedAt);
 if(!Number.isFinite(openedAt)||openedAt>now+30000)return unknown('Incident start time is invalid.');
 const changedAt=primary[0].createdAt?Date.parse(primary[0].createdAt):NaN;
 if(!Number.isFinite(changedAt)||changedAt>openedAt||changedAt<openedAt-1800000)return unknown('No deployment preceded the incident within the correlation window.');
 const previous=[...new Set(observation.deployments.filter(item=>item.status==='ACTIVE'&&item.taskDefinition&&item.taskDefinition!==primary[0].taskDefinition).map(item=>item.taskDefinition!))];
 if(previous.length!==1)return unknown('A single previous deployment could not be identified.');
 return {status:'candidate',explanation:'A recent deployment coincides with impact; correlation is not proof of cause or a rollback authorization.',currentRevision:primary[0].taskDefinition,previousRevision:previous[0],changedAt:new Date(changedAt).toISOString()};
}
