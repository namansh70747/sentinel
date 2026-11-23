import { expect,it } from 'vitest';
import { GitHubSyncClient } from './github-sync';
const sha='a'.repeat(40),token='private-github-read-token';
it('normalizes repository records, follows only repository-scoped pagination and sends conditional headers',async()=>{
 const requests:{url:string;headers:Record<string,string>|undefined}[]=[];
 const client=new GitHubSyncClient(token,{get:async(url,headers)=>{requests.push({url,headers});return headers?.['if-none-match']?{status:304,headers:{etag:'"one"'},text:''}:{status:200,headers:{etag:'"one"',link:'<https://api.github.com/repos/team/checkout/commits?per_page=100&page=2>; rel="next"'},text:JSON.stringify([{sha,html_url:`https://github.com/team/checkout/commit/${sha}`,commit:{message:`Fix ${token}`,author:{date:'2026-11-22T12:00:00Z'}}}])};}});
 const page=await client.page({owner:'team',repo:'checkout',kind:'commits'});
 expect(page.records[0]).toMatchObject({externalId:`commit:${sha}`,revision:sha,title:'Fix [REDACTED]'});expect(page.nextUrl).toContain('page=2');
 expect((await client.page({owner:'team',repo:'checkout',kind:'commits',etag:'"one"'})).notModified).toBe(true);
 expect(requests[0].headers?.authorization).toBe(`Bearer ${token}`);
 await expect(client.page({owner:'team',repo:'checkout',kind:'commits',pageUrl:'https://attacker.example/steal'})).rejects.toThrow();
 await expect(client.page({owner:'team',repo:'checkout',kind:'commits',pageUrl:'https://api.github.com/repos/team/other/commits?page=2'})).rejects.toThrow();
 expect(requests).toHaveLength(2);
});
it('reads deployments, deployment statuses, Actions and checks with stable identities',async()=>{
 const client=new GitHubSyncClient(token,{get:async url=>{
  const body=url.includes('/deployments/12/statuses')?[{id:13,state:'success',created_at:'2026-11-22T12:00:00Z'}]:url.includes('/deployments')?[{id:12,sha,environment:'local',created_at:'2026-11-22T12:00:00Z'}]:url.includes('/actions/runs')?{workflow_runs:[{id:14,head_sha:sha,name:'Verify',status:'completed',conclusion:'success',updated_at:'2026-11-22T12:00:00Z'}]}:{check_runs:[{id:15,head_sha:sha,name:'Typecheck',status:'completed',conclusion:'success',completed_at:'2026-11-22T12:00:00Z'}]};
  return {status:200,headers:{},text:JSON.stringify(body)};
 }});
 for(const kind of ['deployments','deployment-statuses','actions','checks'] as const){const page=await client.page({owner:'team',repo:'checkout',kind,deploymentId:12,sha});expect(page.records).toHaveLength(1);expect(page.records[0].kind).toBe(kind);}
});
