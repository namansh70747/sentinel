import { expect,it } from 'vitest';
import { KubernetesReader } from './kubernetes';
import { parseConnector } from './config';
it('refuses non-local Kubernetes origins and namespaces in product configuration',()=>{
 for(const config of [{endpoint:'https://company.example',namespace:'sentinel-demo'},{endpoint:'https://k3d-sentinel-local-server-0:6443',namespace:'kube-system'}])expect(()=>parseConnector({provider:'kubernetes',name:'Forbidden target',mode:'live',config})).toThrow('dedicated local');
});
it('reads only mapped namespace resources, filters related events and excludes pod environment secrets',async()=>{
 const urls:string[]=[],credential='private-kubernetes-token';
 const reader=new KubernetesReader({endpoint:'https://cluster.example',namespace:'sentinel-demo'},credential,{json:async(raw:string,headers?:Record<string,string>)=>{
  urls.push(raw);expect(headers?.authorization).toBe(`Bearer ${credential}`);
  const url=new URL(raw);expect(url.searchParams.get('limit')).toBe('100');
  if(url.pathname.endsWith('/pods'))return {items:[{metadata:{name:'checkout-1',namespace:'sentinel-demo',uid:'pod-1'},spec:{containers:[{env:[{name:'SECRET',value:'must-never-appear'}]}]},status:{phase:'Pending',containerStatuses:[{ready:false,restartCount:2,state:{waiting:{reason:'CrashLoopBackOff',message:credential}}}]}}],metadata:{}};
  if(url.pathname.endsWith('/events'))return {items:[{metadata:{name:'related',namespace:'sentinel-demo'},involvedObject:{uid:'pod-1'},reason:'Failed',message:credential},{metadata:{name:'unrelated',namespace:'sentinel-demo'},involvedObject:{uid:'other'},message:'unrelated data'}],metadata:{}};
  return {items:[],metadata:{}};
 }});
 const snapshot=await reader.collect('app=checkout');expect(snapshot.records.some(row=>row.reason==='CrashLoopBackOff')).toBe(true);
 expect(snapshot.records.filter(row=>row.kind==='event')).toHaveLength(1);expect(JSON.stringify(snapshot)).not.toContain('must-never-appear');expect(JSON.stringify(snapshot)).not.toContain(credential);
 expect(urls).toHaveLength(4);expect(urls.every(url=>new URL(url).pathname.includes('/namespaces/sentinel-demo/'))).toBe(true);
});
it('reports bounded pagination as partial and rejects namespace traversal',async()=>{
 const reader=new KubernetesReader({endpoint:'https://cluster.example',namespace:'sentinel-demo'},'token',{json:async()=>({items:[],metadata:{continue:'next-page'}})});
 const snapshot=await reader.collect('app=checkout');expect(snapshot.truncated).toBe(true);
 expect(()=>new KubernetesReader({endpoint:'https://cluster.example',namespace:'../kube-system'},'token')).toThrow();
});
