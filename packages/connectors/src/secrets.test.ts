import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SecretVault } from './secrets';

it('encrypts secrets with tenant/connector authenticated context and rejects tampering',()=>{
 const vault=new SecretVault(randomBytes(32));
 const encrypted=vault.seal('workspace-a','connector-a',{token:'private-provider-token'});
 expect(JSON.stringify(encrypted)).not.toContain('private-provider-token');
 expect(vault.open('workspace-a','connector-a',encrypted)).toEqual({token:'private-provider-token'});
 expect(()=>vault.open('workspace-b','connector-a',encrypted)).toThrow();
 expect(()=>vault.open('workspace-a','connector-b',encrypted)).toThrow();
 expect(()=>vault.open('workspace-a','connector-a',{...encrypted,ciphertext:Buffer.from('tampered').toString('base64')})).toThrow();
 expect(()=>new SecretVault(randomBytes(32)).open('workspace-a','connector-a',encrypted)).toThrow();
});
it('requires a 256-bit encryption key and bounds secret size',()=>{
 expect(()=>new SecretVault(Buffer.alloc(16))).toThrow();
 expect(()=>new SecretVault(randomBytes(32)).seal('w','c',{token:'x'.repeat(17000)})).toThrow();
});
