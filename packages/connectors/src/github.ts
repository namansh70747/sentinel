export interface GitHubDeployment { id:number; sha:string; ref:string; environment:string; created_at:string; html_url?:string }
export interface GitHubCommit { sha:string; html_url:string; commit:{message:string;author:{name:string;date:string}|null} }
export class GitHubReadClient {
 constructor(private readonly token:string) {if(!token.trim())throw new Error('GitHub token is required');}
 private async read(path:string) {
  const response=await fetch(`https://api.github.com${path}`,{headers:{authorization:`Bearer ${this.token}`,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','user-agent':'Sentinel'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new Error(`GitHub request failed (${response.status})`);
  return response.json();
 }
 private repository(owner:string,repo:string) {
  if(!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(owner)||!/^[-.\w]{1,100}$/.test(repo)||repo==='.'||repo==='..')throw new Error('Invalid GitHub repository');
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
 }
 async health(){try{await this.read('/rate_limit');return {healthy:true,checkedAt:new Date().toISOString()};}catch{return {healthy:false,checkedAt:new Date().toISOString()};}}
 async deployments(owner:string,repo:string):Promise<GitHubDeployment[]> {
  const body=await this.read(`${this.repository(owner,repo)}/deployments?per_page=100`);
  if(!Array.isArray(body)||body.some(row=>!Number.isSafeInteger(row.id)||typeof row.sha!=='string'||typeof row.ref!=='string'||typeof row.environment!=='string'||typeof row.created_at!=='string'))throw new Error('Invalid deployment response');
  return body;
 }
 async commits(owner:string,repo:string):Promise<GitHubCommit[]> {
  const body=await this.read(`${this.repository(owner,repo)}/commits?per_page=100`);
  if(!Array.isArray(body)||body.some(row=>typeof row.sha!=='string'||typeof row.html_url!=='string'||typeof row.commit?.message!=='string'))throw new Error('Invalid commit response');
  return body;
 }
}
