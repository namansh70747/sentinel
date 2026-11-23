import { randomBytes } from 'node:crypto';
import { expect,it } from 'vitest';
import { openBackup,sealBackup } from './backup-archive';

it('recovers database and connector key together, rejecting wrong keys and modified archives',()=>{
 const key=randomBytes(32),content=Buffer.from('database-snapshot-and-private-connector-key');
 const first=sealBackup(content,key),second=sealBackup(content,key);
 expect(first.equals(second)).toBe(false);expect(first.includes(content)).toBe(false);
 expect(openBackup(first,key)).toEqual(content);
 expect(()=>openBackup(first,randomBytes(32))).toThrow('authenticate');
 const tampered=Buffer.from(first);tampered[tampered.length-1]^=1;
 expect(()=>openBackup(tampered,key)).toThrow('authenticate');
 expect(()=>openBackup(first.subarray(0,20),key)).toThrow();
 expect(()=>sealBackup(content,Buffer.alloc(16))).toThrow();
});
