import {afterEach,expect,it,vi} from 'vitest';
import {GitHubReadClient} from './github';
afterEach(()=>vi.unstubAllGlobals());
it('restricts reads to the official API and refuses invalid repositories',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify([{id:1,sha:'abc',ref:'main',environment:'production',created_at:'2026-11-02T00:00:00Z'}])));vi.stubGlobal('fetch',fetcher);
 expect((await new GitHubReadClient('token').deployments('owner','repo'))[0].sha).toBe('abc');
 expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/repo/deployments?per_page=100');
 expect(fetcher.mock.calls[0][1].redirect).toBe('error');
 await expect(new GitHubReadClient('token').commits('owner','../private')).rejects.toThrow('Invalid');
});
it('does not report failed credentials as connected',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:401})));
 expect((await new GitHubReadClient('bad-token').health()).healthy).toBe(false);
});
