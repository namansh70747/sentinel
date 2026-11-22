import 'server-only';
import { NotificationRepository } from '@sentinel/db/notifications';
import { SecretVault } from '@sentinel/connectors/secrets';
import { getDatabase } from './auth';
let repository:Promise<NotificationRepository>|undefined;
export function notificationRepository(){
 const path=process.env.SENTINEL_CONNECTOR_KEY_FILE;if(!path)throw new Error('Connector key is not configured');
 return repository??=SecretVault.fromFile(path).then(vault=>new NotificationRepository(getDatabase(),vault)).catch(error=>{repository=undefined;throw error;});
}
