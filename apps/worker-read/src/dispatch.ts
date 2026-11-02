import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy, type Client } from '@temporalio/client';
import type { SentinelDatabase } from '@sentinel/db';
/** Privileged worker reads the outbox; deterministic workflow IDs make crash retries safe. */
export async function dispatchOne(db:SentinelDatabase, client:Client, workspaceId?:string) {
 const connection=await db.pool.connect();
 try {
  await connection.query('BEGIN');
  const job=(await connection.query('SELECT * FROM investigation_jobs WHERE dispatched_at IS NULL AND ($1::uuid IS NULL OR workspace_id=$1) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED',[workspaceId??null])).rows[0];
  if(!job){await connection.query('COMMIT');return false;}
  try {await client.workflow.start('investigateIncident',{taskQueue:'sentinel-read',workflowIdReusePolicy:WorkflowIdReusePolicy.REJECT_DUPLICATE,workflowId:`investigation-${job.workspace_id}-${job.incident_id}`,args:[{workspaceId:job.workspace_id,incidentId:job.incident_id,serviceId:job.service_id}]});}
  catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;}
  await connection.query('UPDATE investigation_jobs SET dispatched_at=now() WHERE workspace_id=$1 AND incident_id=$2',[job.workspace_id,job.incident_id]);
  await connection.query('COMMIT');return true;
 }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
}
