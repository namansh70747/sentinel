import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export interface SealedSecret { version: 1; nonce: string; tag: string; ciphertext: string }
export class SecretVault {
 private readonly key:Buffer;
 constructor(key:Buffer){if(key.length!==32)throw new Error('A 256-bit connector encryption key is required');this.key=Buffer.from(key);}
 static async fromFile(path:string){return new SecretVault(await readFile(path));}
 seal(workspaceId:string,connectorId:string,secret:Record<string,string>):SealedSecret {
  if(!secret||Object.values(secret).some(value=>typeof value!=='string'))throw new Error('Invalid connector secret');
  const plain=Buffer.from(JSON.stringify(secret));
  if(plain.length>16384)throw new Error('Connector secret exceeds 16 KiB');
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);
  cipher.setAAD(Buffer.from(JSON.stringify([workspaceId,connectorId])));
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
  return {version:1,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
 }
 open(workspaceId:string,connectorId:string,sealed:SealedSecret):Record<string,string>{
  try{
   if(sealed.version!==1||typeof sealed.ciphertext!=='string'||sealed.ciphertext.length>22000)throw new Error();
   const nonce=Buffer.from(sealed.nonce,'base64'),tag=Buffer.from(sealed.tag,'base64');
   if(nonce.length!==12||tag.length!==16)throw new Error();
   const decipher=createDecipheriv('aes-256-gcm',this.key,nonce);
   decipher.setAAD(Buffer.from(JSON.stringify([workspaceId,connectorId])));decipher.setAuthTag(tag);
   const value=JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext,'base64')),decipher.final()]).toString('utf8'));
   if(!value||Array.isArray(value)||typeof value!=='object'||Object.values(value).some(item=>typeof item!=='string'))throw new Error();
   return value;
  }catch{throw new Error('Unable to decrypt connector secret for this context');}
 }
}
