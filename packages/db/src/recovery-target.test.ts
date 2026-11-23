import { expect,it } from 'vitest';
import { withRecoveryDatabase } from './recovery-target';

it('cleans a generated target even when creation succeeded but its acknowledgement was lost',async()=>{
 const commands:string[]=[],original=new Error('Create acknowledgement lost');
 await expect(withRecoveryDatabase(async sql=>{commands.push(sql);if(sql.startsWith('CREATE'))throw original;},async()=>{throw new Error('Must not restore after unacknowledged creation');})).rejects.toBe(original);
 expect(commands).toHaveLength(2);
 const name=commands[0].replace('CREATE DATABASE ','');
 expect(name).toMatch(/^sentinel_recovery_[a-f0-9]{32}$/);
 expect(commands[1]).toBe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
});
it('preserves the original failure when cleanup also fails',async()=>{
 const original=new Error('Restore failed'),warnings:string[]=[];
 await expect(withRecoveryDatabase(async sql=>{if(sql.startsWith('DROP'))throw new Error('Connection unavailable');},async()=>{throw original;},name=>warnings.push(name))).rejects.toBe(original);
 expect(warnings).toHaveLength(1);
});
