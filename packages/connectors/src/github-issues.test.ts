import { expect, it } from 'vitest';
import { prepareGitHubIssue } from './github-issues';
it('stays not-configured without a token and refuses a different repository', () => {
 expect(prepareGitHubIssue({ owner: 'acme', repo: 'demo', allowedOwner: 'acme', allowedRepo: 'demo', title: 'Incident', body: 'note' }).outcome).toBe('not-configured');
 expect(() => prepareGitHubIssue({ token: 'secret', owner: 'other', repo: 'demo', allowedOwner: 'acme', allowedRepo: 'demo', title: 'Incident', body: 'note' })).toThrow(/approved/);
 const ready = prepareGitHubIssue({ token: 'secret', owner: 'acme', repo: 'demo', allowedOwner: 'acme', allowedRepo: 'demo', title: 'Incident', body: 'note' });
 expect(ready).toEqual({ outcome: 'ready', url: 'https://api.github.com/repos/acme/demo/issues' });
});
