import {expect,it,vi} from 'vitest';
import {rankWithHostedProviders} from './incident-recommendation';

const evidence=[{source:'ecs',outcome:'denied',provenance:'live',attempt_id:'private-id'}];
const keys={gemini:'fixture-gemini',nvidia:'fixture-nvidia'};
const gemini=(text:string)=>Response.json({candidates:[{content:{parts:[{text}]}}]});
const nvidia=(content:string)=>Response.json({choices:[{message:{content}}]});

it('uses Gemini first and transmits only candidate codes',async()=>{
 const request=vi.fn<typeof fetch>().mockResolvedValue(gemini('{"source":"ecs"}'));
 const result=await rankWithHostedProviders(evidence,keys,request);
 expect(result).toMatchObject({provider:'gemini',choice:'ecs',attempts:1});
 expect(request).toHaveBeenCalledTimes(1);
 expect(request.mock.calls[0][1]?.body).not.toContain('private-id');
 expect(request.mock.calls[0][1]?.headers).toMatchObject({'x-goog-api-key':keys.gemini});
});

it('uses NVIDIA after a rate limit or invalid choice',async()=>{
 for(const failure of [new Response(null,{status:429}),gemini('{"source":"invented"}')]){
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(failure).mockResolvedValueOnce(nvidia('{"source":"ecs"}'));
  expect(await rankWithHostedProviders(evidence,keys,request)).toMatchObject({provider:'nvidia',choice:'ecs',attempts:2});
  expect(request.mock.calls[1][1]?.headers).toMatchObject({authorization:'Bearer fixture-nvidia'});
 }
});

it('bounds attempts and tolerates timeout and missing keys',async()=>{
 const request=vi.fn<typeof fetch>().mockRejectedValue(new DOMException('Timed out','TimeoutError'));
 expect(await rankWithHostedProviders(evidence,{},request)).toEqual(null);
 expect(request).not.toHaveBeenCalled();
 expect(await rankWithHostedProviders(evidence,keys,request)).toMatchObject({status:'unavailable',attempts:2});
 expect(request).toHaveBeenCalledTimes(2);
 const nvidiaOnly=vi.fn<typeof fetch>().mockResolvedValue(nvidia('{"source":"ecs"}'));
 expect(await rankWithHostedProviders(evidence,{nvidia:keys.nvidia},nvidiaOnly)).toMatchObject({provider:'nvidia',attempts:1});
});

it('keeps simulated and unrecognized evidence out of hosted requests',async()=>{
 const request=vi.fn<typeof fetch>().mockResolvedValue(gemini('{"source":"ecs"}'));
 const result=await rankWithHostedProviders([
  ...evidence,
  {source:'cloudwatch',outcome:'unavailable',provenance:'simulated'},
  {source:'unrecognized-source',outcome:'private-free-text',provenance:'live'},
 ],keys,request);
 expect(result?.choice).toBe('ecs');
 expect(request.mock.calls[0][1]?.body).not.toMatch(/cloudwatch|unrecognized-source|private-free-text/);
});

it('rejects additional model claims and falls back to a validated choice',async()=>{
 const request=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(gemini('{"source":"ecs","claim":"The service recovered"}'))
  .mockResolvedValueOnce(nvidia('{"source":"ecs"}'));
 expect(await rankWithHostedProviders(evidence,keys,request)).toMatchObject({provider:'nvidia',status:'accepted',attempts:2});
});
