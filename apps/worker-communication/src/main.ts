import { SentinelDatabase } from '@sentinel/db';
import { NotificationRepository } from '@sentinel/db/notifications';
import { SecretVault } from '@sentinel/connectors/secrets';
import { CommunicationProcessor } from './processor';
if(!process.env.DATABASE_URL||!process.env.SENTINEL_CONNECTOR_KEY_FILE)throw new Error('Database and connector key are required');
const vault=await SecretVault.fromFile(process.env.SENTINEL_CONNECTOR_KEY_FILE),db=new SentinelDatabase(process.env.DATABASE_URL);
const processor=new CommunicationProcessor(db,new NotificationRepository(db,vault));
let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stopping=true;});
console.log('Communication worker started; only approved, version-bound destinations can publish.');
try{while(!stopping){try{await processor.tick();}catch{console.error('Communication processing failed; unresolved sends remain unknown after recovery.');}if(!stopping)await new Promise(resolve=>setTimeout(resolve,500));}}finally{await db.close();}
