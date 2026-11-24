import { WorkflowExecutionAlreadyStartedError,WorkflowNotFoundError,WorkflowIdReusePolicy,type Client } from '@temporalio/client';
import type { SentinelDatabase } from '@sentinel/db';
import { InvestigationRepository } from '@sentinel/db/investigations';

export async function dispatchRun(db:SentinelDatabase,client:Client,workspaceId:string){return db.inWorkspace(workspaceId,async connection=>{
 const run=(await connection.query("SELECT * FROM investigation_runs WHERE workspace_id=$1 AND status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[workspaceId])).rows[0];
 if(!run)return false;
 const extraSources=(await connection.query("SELECT source FROM investigation_source_attempts WHERE workspace_id=$1 AND run_id=$2 AND source='kubernetes'",[workspaceId,run.id])).rows.map(row=>row.source);
 try{
  await client.workflow.start('investigateIncident',{taskQueue:'sentinel-read',workflowExecutionTimeout:'10 minutes',workflowIdReusePolicy:WorkflowIdReusePolicy.REJECT_DUPLICATE,workflowId:`investigation-run-${workspaceId}-${run.id}`,args:[{workspaceId,incidentId:run.incident_id,serviceId:run.service_id,runId:run.id,...(extraSources.length?{extraSources}:{})}]});
 }catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;}
 await connection.query("UPDATE investigation_runs SET status='running' WHERE workspace_id=$1 AND id=$2 AND status='queued'",[workspaceId,run.id]);return true;
});}
export async function reconcileRun(db:SentinelDatabase,client:Client,workspaceId:string){
 const run=await db.inWorkspace(workspaceId,async connection=>(await connection.query("SELECT * FROM investigation_runs WHERE workspace_id=$1 AND status='running' AND created_at<now()-interval '2 minutes' ORDER BY created_at LIMIT 1",[workspaceId])).rows[0]);
 if(!run)return false;
 let failed=false;
 try{
  const description=await client.connection.withDeadline(Date.now()+5000,()=>client.workflow.getHandle(`investigation-run-${workspaceId}-${run.id}`).describe());
  failed=['FAILED','CANCELLED','CANCELED','TERMINATED','TIMED_OUT','COMPLETED'].includes(description.status.name);
 }catch(error){if(error instanceof WorkflowNotFoundError)failed=true;else throw error;}
 if(failed)await new InvestigationRepository(db).finish({workspaceId,runId:run.id,incidentId:run.incident_id,serviceId:run.service_id},'failed','Temporal execution ended without a persisted investigation completion.');
 return failed;
}
export class RunDispatcher {
 private cursor='00000000-0000-0000-0000-000000000000';
 constructor(private readonly db:SentinelDatabase,private readonly client:Client){}
 async tick(){
  const workspaces=(await this.db.pool.query('SELECT id FROM workspaces WHERE id>$1 ORDER BY id LIMIT 25',[this.cursor])).rows;
  if(!workspaces.length){this.cursor='00000000-0000-0000-0000-000000000000';return;}
  for(const workspace of workspaces){this.cursor=workspace.id;await reconcileRun(this.db,this.client,workspace.id);if(await dispatchRun(this.db,this.client,workspace.id))return;}
 }
}
