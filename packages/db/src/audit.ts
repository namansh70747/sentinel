import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
 if (value === null || typeof value !== 'object') {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Audit payload must be JSON serializable');
  return encoded;
 }
 if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
 return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
}
export function auditHash(input: {workspaceId:string;id:string;actor:string;action:string;payload:unknown;previousHash:string}) {
 return createHash('sha256').update(canonicalJson([input.workspaceId,input.id,input.actor,input.action,input.payload,input.previousHash])).digest('hex');
}
export interface AuditRow { workspace_id:string; id:string; actor:string; action:string; payload:unknown; previous_hash:string; hash:string; hash_version:number }
export function verifyAuditSegment(rows:AuditRow[]) {
 let previous:string|undefined;
 for(const row of rows) {
  if(row.hash_version!==2) return {verified:false,reason:'Legacy entries require their original serialization.'};
  if(previous!==undefined && row.previous_hash!==previous)return {verified:false,reason:'Audit chain link mismatch.'};
  if(auditHash({workspaceId:row.workspace_id,id:row.id,actor:row.actor,action:row.action,payload:row.payload,previousHash:row.previous_hash})!==row.hash)return {verified:false,reason:'Audit content hash mismatch.'};
  previous=row.hash;
 }
 return {verified:true,reason:rows.length?'Returned audit segment verified.':'No audit events yet.'};
}
