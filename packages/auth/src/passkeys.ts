import { randomUUID,createHash } from 'node:crypto';
import { generateRegistrationOptions,verifyRegistrationResponse,type RegistrationResponseJSON } from '@simplewebauthn/server';
import type { SentinelDatabase } from '@sentinel/db';
const sessionHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export class PasskeyEnrollment {
 private readonly rpId:string;
 constructor(private readonly db:SentinelDatabase,private readonly origin:string) {
  const url=new URL(origin);
  if(url.origin!==origin || (url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Invalid passkey origin');
  this.rpId=url.hostname;
 }
 async begin(identityId:string,rawSession:string) {
  const existing=await this.db.pool.query('SELECT id FROM passkeys WHERE identity_id=$1',[identityId]);
  const options=await generateRegistrationOptions({rpName:'Sentinel',rpID:this.rpId,userName:identityId,userID:new TextEncoder().encode(identityId),attestationType:'none',excludeCredentials:existing.rows.map(row=>({id:row.id})),authenticatorSelection:{residentKey:'preferred',userVerification:'required'}});
  const id=randomUUID();
  await this.db.pool.query("INSERT INTO passkey_challenges(id,identity_id,session_hash,challenge,purpose,expires_at) VALUES($1,$2,$3,$4,'registration',now()+interval '5 minutes')",[id,identityId,sessionHash(rawSession),options.challenge]);
  return {challengeId:id,options};
 }
 async complete(identityId:string,rawSession:string,challengeId:string,response:RegistrationResponseJSON) {
  const row=(await this.db.pool.query("DELETE FROM passkey_challenges WHERE id=$1 AND identity_id=$2 AND session_hash=$3 AND purpose='registration' AND expires_at>now() RETURNING challenge",[challengeId,identityId,sessionHash(rawSession)])).rows[0];
  if(!row)throw new Error('Enrollment expired or already used');
  const verification=await verifyRegistrationResponse({response,expectedChallenge:row.challenge,expectedOrigin:this.origin,expectedRPID:this.rpId,requireUserVerification:true});
  if(!verification.verified||!verification.registrationInfo)throw new Error('Passkey verification failed');
  const credential=verification.registrationInfo.credential;
  await this.db.pool.query('INSERT INTO passkeys(id,identity_id,public_key,counter,transports) VALUES($1,$2,$3,$4,$5)',[credential.id,identityId,Buffer.from(credential.publicKey),credential.counter,JSON.stringify(credential.transports??[])]);
  return {verified:true};
 }
}
