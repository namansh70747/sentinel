import { expect,it } from 'vitest';
import { auditHash,verifyAuditSegment } from './audit';
it('verifies canonical audit content after JSON key reordering and detects tampering',()=>{
 const content={workspaceId:'a',id:'1',actor:'operator',action:'test',payload:{z:1,a:{y:2,x:3}},previousHash:'0'.repeat(64)};
 const row={workspace_id:'a',id:'1',actor:'operator',action:'test',payload:{a:{x:3,y:2},z:1},previous_hash:content.previousHash,hash:auditHash(content),hash_version:2};
 expect(verifyAuditSegment([row]).verified).toBe(true);
 expect(verifyAuditSegment([{...row,actor:'tampered'}]).verified).toBe(false);
 expect(verifyAuditSegment([row,{...row,id:'2',previous_hash:'broken'}]).verified).toBe(false);
});
