import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { SentinelDatabase } from '@sentinel/db';
import { PasskeyEnrollment } from './passkeys';
describe.skipIf(!process.env.TEST_DATABASE_URL)('session-bound passkey enrollment',()=>{
 const db=new SentinelDatabase(process.env.TEST_DATABASE_URL!);
 const identity=randomUUID(),other=randomUUID();
 const enrollment=new PasskeyEnrollment(db,'http://localhost:3010');
 beforeAll(async()=>{for(const id of [identity,other])await db.pool.query('INSERT INTO identities(id,issuer,subject) VALUES($1,$2,$3)',[id,'https://identity.example',id]);});
 afterAll(()=>db.close());
 it('requires the same identity and session and consumes failed verification once',async()=>{
  const challenge=await enrollment.begin(identity,'session-a');
  expect(challenge.options.authenticatorSelection?.userVerification).toBe('required');
  await expect(enrollment.complete(other,'session-a',challenge.challengeId,{} as RegistrationResponseJSON)).rejects.toThrow('expired');
  await expect(enrollment.complete(identity,'session-b',challenge.challengeId,{} as RegistrationResponseJSON)).rejects.toThrow('expired');
  await expect(enrollment.complete(identity,'session-a',challenge.challengeId,{} as RegistrationResponseJSON)).rejects.toThrow();
  await expect(enrollment.complete(identity,'session-a',challenge.challengeId,{} as RegistrationResponseJSON)).rejects.toThrow('already used');
 });
});
