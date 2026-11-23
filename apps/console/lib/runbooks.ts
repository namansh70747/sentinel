import 'server-only';
import { RunbookError } from '@sentinel/db/runbooks';
export function runbookError(error:unknown){
 if(error instanceof RunbookError)return Response.json({error:error.message},{status:error.status});
 return Response.json({error:'Runbook operation failed. Check server availability.'},{status:503});
}
