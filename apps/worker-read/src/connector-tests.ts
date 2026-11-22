import type { SentinelDatabase } from '@sentinel/db';
import type { ConnectorRepository } from '@sentinel/db/connectors';
import { testConnection } from '@sentinel/connectors/connection-test';
export class ConnectorTestRunner {
 private cursor='00000000-0000-0000-0000-000000000000';
 constructor(private readonly db:SentinelDatabase,private readonly repository:ConnectorRepository){}
 async tick(){
  const rows=(await this.db.pool.query('SELECT id FROM workspaces WHERE id>$1 ORDER BY id LIMIT 25',[this.cursor])).rows;
  if(!rows.length){this.cursor='00000000-0000-0000-0000-000000000000';return;}
  for(const workspace of rows){this.cursor=workspace.id;const job=await this.repository.claimTest(workspace.id);if(!job)continue;
   const result=await testConnection(job);await this.repository.finishTest(workspace.id,job.testId,job.attempt,result);return;
  }
 }
}
