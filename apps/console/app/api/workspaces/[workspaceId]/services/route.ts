import { parseEcsServiceArn } from "@sentinel/connectors";
import { randomUUID } from 'node:crypto';
import { currentIdentity, getDatabase } from '../../../../../lib/auth';
async function membership(workspaceId: string, identityId: string) {
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) return null;
 return (await getDatabase().pool.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2',[workspaceId,identityId])).rows[0];
}
export async function GET(_: Request, context: {params:Promise<{workspaceId:string}>}) {
 const identity = await currentIdentity();
 if (!identity) return Response.json({error:'Authentication required'},{status:401});
 const {workspaceId} = await context.params;
 if (!await membership(workspaceId,identity.id)) return Response.json({error:'Workspace not found'},{status:404});
 const rows = await getDatabase().inWorkspace(workspaceId,async client => (await client.query('SELECT * FROM services ORDER BY created_at DESC')).rows);
 return Response.json(rows,{headers:{'cache-control':'no-store'}});
}
export async function POST(request:Request,context:{params:Promise<{workspaceId:string}>}) {
 if (request.headers.get('origin') !== process.env.SENTINEL_PUBLIC_URL) return Response.json({error:'Invalid origin'},{status:403});
 const identity = await currentIdentity();
 if (!identity) return Response.json({error:'Authentication required'},{status:401});
 const {workspaceId} = await context.params;
 if ((await membership(workspaceId,identity.id))?.role !== 'admin') return Response.json({error:'Administrator access required'},{status:403});
 let body: Record<string,unknown>;
 try {body = await request.json();} catch {return Response.json({error:'Invalid JSON'},{status:400});}
 const fields = ['name','owner','account_id','region','resource_arn'] as const;
 if (!body || fields.some(field => typeof body[field] !== 'string' || !(body[field] as string).trim() || (body[field] as string).length > 2048) || !/^\d{12}$/.test(body.account_id as string) || !/^arn:aws[a-z-]*:ecs:/.test(body.resource_arn as string)) return Response.json({error:'Provide name, owner, 12-digit AWS account, region and ECS service ARN'},{status:400});
 try {const arn=parseEcsServiceArn(body.resource_arn as string);if(arn.accountId!==body.account_id||arn.region!==body.region)return Response.json({error:'Service ARN must match the registered account and region'},{status:400});} catch {return Response.json({error:'Provide a long ECS service ARN containing cluster and service names'},{status:400});}
 const id = randomUUID(), db = getDatabase();
 await db.inWorkspace(workspaceId, async client => {
  await client.query('INSERT INTO services(workspace_id,id,name,owner,account_id,region,resource_arn) VALUES($1,$2,$3,$4,$5,$6,$7)',[workspaceId,id,body.name,body.owner,body.account_id,body.region,body.resource_arn]);
  await db.appendAuditInTransaction(client,workspaceId,identity.id,'service.created',{id,name:body.name,act:false});
 });
 return Response.json({id,act:false},{status:201});
}
