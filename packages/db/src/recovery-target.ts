import { randomUUID } from 'node:crypto';

/** The caller cannot supply a restore/drop target. Even a lost CREATE reply is cleaned. */
export async function withRecoveryDatabase<T>(query:(sql:string)=>Promise<unknown>,operation:(database:string)=>Promise<T>,onCleanupFailure=(database:string)=>console.error(`Temporary recovery database cleanup failed: ${database}`)){
 const database='sentinel_recovery_'+randomUUID().replaceAll('-','');let failed=false;
 try{await query(`CREATE DATABASE ${database}`);return await operation(database);}
 catch(error){failed=true;throw error;}
 finally{
  try{await query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);}
  catch(error){onCleanupFailure(database);if(!failed)throw error;}
 }
}
