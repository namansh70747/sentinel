import { createServer } from 'node:http';
import type { SentinelDatabase } from '@sentinel/db';

export function serveAdvisoryMetrics(db: SentinelDatabase, port: number) {
 let snapshot: string|undefined;
 let pending=false;
 const refresh=async()=>{
  if(pending)return;
  pending=true;
  try {
   const states = ['accepted','invalid','unavailable','skipped'] as const;
   const providers = ['ollama','bedrock'] as const;
   const totals = new Map<string,{count:number;seconds:number;measured:number}>();
   const workspaces=(await db.pool.query('SELECT id FROM workspaces ORDER BY id LIMIT 201')).rows;
   if(workspaces.length>200)throw Error('Advisory metrics workspace capacity exceeded');
   for(const {id} of workspaces){
    const rows=await db.inWorkspace(id,async c=>(await c.query(`SELECT advisory_model_result->>'provider' AS provider,
     advisory_model_result->>'status' AS status, count(*)::int AS count,
     count(*) FILTER (WHERE jsonb_typeof(advisory_model_result->'durationMs')='number')::int AS measured,
     coalesce(sum(CASE WHEN jsonb_typeof(advisory_model_result->'durationMs')='number'
      THEN (advisory_model_result->>'durationMs')::double precision END),0)/1000 AS seconds
     FROM investigation_runs WHERE workspace_id=$1 AND finished_at>now()-interval '1 hour'
     GROUP BY 1,2`,[id])).rows);
    for(const row of rows){
     const key=`${row.provider}:${row.status}`;
     const total=totals.get(key)??{count:0,seconds:0,measured:0};
     totals.set(key,{count:total.count+row.count,seconds:total.seconds+row.seconds,measured:total.measured+row.measured});
    }
   }
   const lines=[
    '# TYPE sentinel_advisory_evaluations_last_hour gauge',
    '# TYPE sentinel_advisory_mean_evaluation_seconds_last_hour gauge',
   ];
   for(const provider of providers)for(const status of states){
    const total=totals.get(`${provider}:${status}`);
    lines.push(`sentinel_advisory_evaluations_last_hour{provider="${provider}",status="${status}"} ${total?.count??0}`);
    if(total?.measured&&status!=='skipped')lines.push(`sentinel_advisory_mean_evaluation_seconds_last_hour{provider="${provider}",status="${status}"} ${total.seconds/total.measured}`);
   }
   snapshot=lines.join('\n')+'\n';
  }catch{
   snapshot=undefined;
  }finally{pending=false;}
 };
 const timer=setInterval(()=>void refresh(),30000);
 void refresh();
 const server=createServer((request,response)=>{
  if(request.method!=='GET'||request.url!=='/metrics'){response.writeHead(404).end();return;}
  response.writeHead(snapshot?200:503,{'content-type':'text/plain; version=0.0.4'});
  response.end(snapshot??'Metrics unavailable\n');
 });
 server.on('error',()=>console.error('Advisory metrics listener failed'));
 server.listen(port,'0.0.0.0');
 return ()=>{clearInterval(timer);server.close();};
}
