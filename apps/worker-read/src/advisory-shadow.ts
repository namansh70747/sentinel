import type { SentinelDatabase } from '@sentinel/db';
import { bedrockAdvisoryConfig, finalizeModelAdvisory, modelAdvisoryCandidates, rankWithBedrock, rankWithLocalOllama, type RecommendationEvidence } from '@sentinel/connectors/incident-recommendation';

export class AdvisoryShadow {
 private cursor = '00000000-0000-0000-0000-000000000000';
 private failures = 0;
 private pauseUntil = 0;
 constructor(private readonly db: SentinelDatabase) {}

 async tick() {
  if (!process.env.SENTINEL_RECOMMENDATION_OLLAMA_URL || !process.env.OLLAMA_MODEL || Date.now() < this.pauseUntil) return;
  const workspaces = (await this.db.pool.query('SELECT id FROM workspaces WHERE id>$1 ORDER BY id LIMIT 25', [this.cursor])).rows;
  if (!workspaces.length) this.cursor = '00000000-0000-0000-0000-000000000000';
  for (const {id} of workspaces) {
   this.cursor = id;
   const pending = await this.db.inWorkspace(id, async client => {
    await client.query(`UPDATE investigation_runs
     SET advisory_model_result=advisory_model_result||'{"status":"unavailable","reason":"worker-interrupted"}'::jsonb
     WHERE workspace_id=$1 AND advisory_model_result->>'status'='claimed'
      AND coalesce((advisory_model_result->>'claimedAt')::timestamptz,finished_at)<now()-interval '1 minute'`,[id]);
    const run = (await client.query(`SELECT id,status FROM investigation_runs
     WHERE workspace_id=$1 AND advisory IS NOT NULL AND advisory_model_result IS NULL
      AND finished_at>now()-interval '5 minutes' ORDER BY finished_at DESC LIMIT 1
      FOR UPDATE SKIP LOCKED`, [id])).rows[0];
    if (!run) return;
    const evidence = (await client.query<RecommendationEvidence>(
     'SELECT source,outcome,provenance,severity,attempt_id FROM investigation_evidence WHERE workspace_id=$1 AND run_id=$2',
     [id,run.id],
    )).rows;
    await client.query("UPDATE investigation_runs SET advisory_model_result=jsonb_build_object('status','claimed','claimedAt',now(),'provider','ollama') WHERE workspace_id=$1 AND id=$2", [id,run.id]);
    return {id:run.id,status:run.status,evidence};
   });
   if (!pending) continue;
   const started = Date.now();
   const candidates = pending.status==='failed'?[]:modelAdvisoryCandidates(pending.evidence);
   let status = 'skipped', choice: string | null = null;
   let provider='ollama', model=process.env.OLLAMA_MODEL;
   let usage:{inputTokens?:number;outputTokens?:number}|undefined;
   let hostedAttempt=false;
   if (candidates.length > 0) {
    try {
     const result = await rankWithLocalOllama(candidates);
     choice = candidates.some(item => item.source === result) ? result : null;
     status = choice ? 'accepted' : 'invalid';
     this.failures = 0;
    } catch {
     status = 'unavailable';
     if (++this.failures >= 3) { this.pauseUntil = Date.now() + 60_000; this.failures = 0; }
    }
   }
   const bedrock=bedrockAdvisoryConfig(id);
   if(bedrock&&candidates.length>0&&!choice){
    hostedAttempt=await this.db.inWorkspace(id,async client=>{
     await client.query("SELECT pg_advisory_xact_lock(hashtextextended('advisory-bedrock:'||$1,0))",[id]);
     const result=await client.query(`SELECT count(*)::int AS calls FROM investigation_runs
       WHERE workspace_id=$1 AND advisory_model_result->>'hostedAttempt'='true'
       AND finished_at>now()-interval '24 hours'`,[id]);
     if(result.rows[0].calls>=10)return false;
     await client.query(`UPDATE investigation_runs SET advisory_model_result=advisory_model_result||'{"hostedAttempt":true,"provider":"bedrock"}'::jsonb
       WHERE workspace_id=$1 AND id=$2`,[id,pending.id]);
     return true;
    });
    if(hostedAttempt){
     provider='bedrock';model=bedrock.model;
     try{
      const result=await rankWithBedrock(bedrock,candidates);
      choice=candidates.some(item=>item.source===result.choice)?result.choice:null;
      usage={inputTokens:result.inputTokens,outputTokens:result.outputTokens};
      status=choice?'accepted':'invalid';
     }catch{status='unavailable';}
    }
   }
   const mode=process.env.SENTINEL_ADVISORY_MODE==='live'?'live':'shadow';
   const revision=mode==='live'&&choice?finalizeModelAdvisory(pending.status,pending.evidence,choice,provider):null;
   await this.db.inWorkspace(id, async client => {
    await client.query("UPDATE investigation_runs SET advisory_model_result=$3 WHERE workspace_id=$1 AND id=$2 AND advisory_model_result->>'status'='claimed'",
     [id,pending.id,{status,choice,model,provider,usage,hostedAttempt,durationMs:Date.now()-started,mode,revision}]);
   });
   return;
  }
 }
}
