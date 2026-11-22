import type { SentinelDatabase } from '@sentinel/db';
import type { NotificationRepository } from '@sentinel/db/notifications';
import { deliverNotification } from '@sentinel/connectors/notification-delivery';
export class CommunicationProcessor {
 private cursor='00000000-0000-0000-0000-000000000000';
 constructor(private readonly db:SentinelDatabase,private readonly repository:NotificationRepository){}
 async tick(){
  const workspaces=(await this.db.pool.query('SELECT id FROM workspaces WHERE id>$1 ORDER BY id LIMIT 25',[this.cursor])).rows;
  if(!workspaces.length){this.cursor='00000000-0000-0000-0000-000000000000';return;}
  for(const workspace of workspaces){
   this.cursor=workspace.id;const delivery=await this.repository.claim(workspace.id);if(!delivery)continue;
   const result=await deliverNotification(delivery);
   await this.repository.finish(workspace.id,delivery.deliveryId,delivery.attemptId,result);return;
  }
 }
}
