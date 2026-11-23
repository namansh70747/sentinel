import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
const magic=Buffer.from('SENTINEL_BACKUP_1\n'),maximum=128*1024*1024;
export function sealBackup(plain:Buffer,key:Buffer){
 if(key.length!==32||plain.length>maximum)throw new Error('Invalid backup key or archive size');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(magic);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
 return Buffer.concat([magic,nonce,cipher.getAuthTag(),encrypted]);
}
export function openBackup(archive:Buffer,key:Buffer){
 if(key.length!==32||archive.length<magic.length+28||archive.length>maximum+magic.length+28||!archive.subarray(0,magic.length).equals(magic))throw new Error('Invalid backup key, format or archive size');
 try{
  const offset=magic.length,decipher=createDecipheriv('aes-256-gcm',key,archive.subarray(offset,offset+12));
  decipher.setAAD(magic);decipher.setAuthTag(archive.subarray(offset+12,offset+28));
  return Buffer.concat([decipher.update(archive.subarray(offset+28)),decipher.final()]);
 }catch{throw new Error('Unable to authenticate backup archive');}
}
