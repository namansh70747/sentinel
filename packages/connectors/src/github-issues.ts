export interface IssueRequest { token?: string; owner: string; repo: string; allowedOwner: string; allowedRepo: string; title: string; body: string }
export function prepareGitHubIssue(input: IssueRequest): { outcome: 'not-configured' } | { outcome: 'ready'; url: string } {
 if (!input.token) return { outcome: 'not-configured' };
 if (input.owner !== input.allowedOwner || input.repo !== input.allowedRepo) throw new Error('Issue destination is not the approved repository');
 if (!input.title.trim() || input.title.length > 240 || input.body.length > 8000) throw new Error('Invalid issue text');
 return { outcome: 'ready', url: `https://api.github.com/repos/${input.owner}/${input.repo}/issues` };
}
