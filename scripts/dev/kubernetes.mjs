import { spawnSync } from 'node:child_process';
import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { homedir } from 'node:os';
import { createHash,randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

const action=process.argv[2]??'up',name='sentinel-local',context='k3d-'+name,directory=resolve('.local/kubernetes'),admin=join(directory,'admin.kubeconfig'),reader=join(directory,'reader.kubeconfig');
const env={...process.env,KUBECONFIG:admin};
function run(command,args,{privateOutput=false,allowFailure=false,timeout=30000}={}){
 const result=spawnSync(command,args,{env,encoding:'utf8',timeout,maxBuffer:2*1024*1024});
 if(result.error||result.status!==0){if(allowFailure)return {ok:false,text:result.stdout??'',diagnostic:result.stderr??'',status:result.status};throw new Error(`${command} failed; no default kubeconfig or cluster was used.`);}
 if(!privateOutput&&result.stdout?.trim())console.log(result.stdout.trim());
 return {ok:true,text:result.stdout??''};
}
function kubectl(config,args,options){return run('kubectl',['--kubeconfig',config,'--context',context,'--request-timeout=10s',...args],options);}
async function digestGlobal(){try{return createHash('sha256').update(await readFile(join(homedir(),'.kube/config'))).digest('hex');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function replacePrivate(path,value){const temporary=path+'.'+randomUUID();await writeFile(temporary,value,{mode:0o600,flag:'wx'});await rename(temporary,path);}
const globalBefore=await digestGlobal();
try{
 await mkdir(directory,{recursive:true,mode:0o700});
 const clusters=JSON.parse(run('k3d',['cluster','list','-ojson'],{privateOutput:true}).text),exists=clusters.some(cluster=>cluster.name===name);
 let owned=false;try{const state=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));const actual=exists?run('docker',['inspect','--format','{{.Id}}','k3d-sentinel-local-server-0'],{privateOutput:true}).text.trim():null;owned=state.cluster===name&&state.repository===process.cwd()&&typeof state.containerId==='string'&&state.containerId===actual;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(exists&&!owned)throw new Error('A cluster with this name already exists without this repository ownership record; it was not modified.');
 if(action==='stop'){if(!owned||!exists)throw new Error('No owned local cluster to stop');run('k3d',['cluster','stop',name]);}
 else if(action==='up'){
  const allocated=Number(run('docker',['info','--format','{{.MemTotal}}'],{privateOutput:true}).text);if(allocated<7.5*1024**3)throw new Error('Core plus Kubernetes requires at least 7.5 GiB Docker allocation; no cluster was started.');
  if(!exists){
   await new Promise((resolveProbe,reject)=>{const server=createServer();server.once('error',()=>reject(new Error('Local Kubernetes API port 6550 is occupied')));server.listen(6550,'127.0.0.1',()=>server.close(resolveProbe));});
   run('k3d',['cluster','create',name,'--servers','1','--agents','0','--servers-memory','1536m','--image','rancher/k3s:v1.35.5-k3s1','--api-port','127.0.0.1:6550','--no-lb','--kubeconfig-update-default=false','--kubeconfig-switch-context=false','--k3s-arg','--disable=traefik,servicelb,metrics-server@server:0','--k3s-arg','--tls-san=k3d-sentinel-local-server-0@server:0','--wait','--timeout','120s'],{timeout:150000});
   const containerId=run('docker',['inspect','--format','{{.Id}}','k3d-sentinel-local-server-0'],{privateOutput:true}).text.trim();
   await replacePrivate(join(directory,'state.json'),JSON.stringify({cluster:name,repository:process.cwd(),containerId})+'\n');
  }else run('k3d',['cluster','start',name,'--wait','--timeout','90s'],{timeout:100000});
  const kubeconfig=run('k3d',['kubeconfig','get',name],{privateOutput:true}).text;await replacePrivate(admin,kubeconfig);
  kubectl(admin,['apply','-f','ops/kubernetes/local-fixture.yml']);
  const config=JSON.parse(kubectl(admin,['config','view','--raw','-o','json'],{privateOutput:true}).text);
  const cluster=config.clusters.find(item=>item.name===context)?.cluster;if(!cluster)throw new Error('Isolated local cluster configuration missing');
  const token=kubectl(admin,['-n','sentinel-demo','create','token','sentinel-reader','--duration=24h'],{privateOutput:true}).text.trim();
  await replacePrivate(reader,JSON.stringify({apiVersion:'v1',kind:'Config',clusters:[{name:context,cluster}],users:[{name:'sentinel-reader',user:{token}}],contexts:[{name:context,context:{cluster:context,user:'sentinel-reader',namespace:'sentinel-demo'}}],'current-context':context})+'\n');
  await replacePrivate(join(directory,'connection.json'),JSON.stringify({endpoint:'https://k3d-sentinel-local-server-0:6443',namespace:'sentinel-demo',certificateAuthority:Buffer.from(cluster['certificate-authority-data'],'base64').toString('utf8'),token})+'\n');
  console.log('Owned local cluster and namespace-only 24-hour reader configured. Private kubeconfigs stay under .local/kubernetes/.');
  console.log('Run dev:test-kubernetes for actual reads and permission-denial acceptance. Product connector acceptance remains separate.');
 }else if(action==='test'){
  if(!owned||!exists)throw new Error('Prepare the owned local cluster first');
  const observations={observedAt:new Date().toISOString(),namespace:'sentinel-demo',provenance:'live',resources:{}};
  for(const resource of ['pods','deployments','services','events']){
   const body=JSON.parse(kubectl(reader,['-n','sentinel-demo','get',resource,'-o','json','--chunk-size=100'],{privateOutput:true}).text);
   if(!Array.isArray(body.items))throw new Error('Invalid Kubernetes list');
   if(body.items.length>200)throw new Error('Fixture acceptance exceeded its 200-record bound; no full-coverage result was reported.');
   observations.resources[resource]=body.items.map(item=>({name:item.metadata?.name,uid:item.metadata?.uid,phase:item.status?.phase,readyReplicas:item.status?.readyReplicas??0,desiredReplicas:item.spec?.replicas,reason:item.reason,containerStates:item.status?.containerStatuses?.map(status=>({ready:status.ready,restarts:status.restartCount,waitingReason:status.state?.waiting?.reason}))}));
  }
  for(const args of [['-n','sentinel-demo','get','secrets'],['-n','kube-system','get','pods'],['-n','sentinel-demo','auth','can-i','create','deployments']]){
   const result=kubectl(reader,args,{privateOutput:true,allowFailure:true});
   const expectedDenial=args.includes('can-i')?result.text.trim()==='no':/\bForbidden\b/.test(result.diagnostic??'');
   if(result.ok||result.status!==1||!expectedDenial)throw new Error('Expected an actual Kubernetes permission denial; no successful permission gate was reported.');
  }
  await replacePrivate(join(directory,'last-observation.json'),JSON.stringify(observations,null,2)+'\n');
  console.log(JSON.stringify({namespace:'sentinel-demo',counts:Object.fromEntries(Object.entries(observations.resources).map(([kind,rows])=>[kind,rows.length])),secretReadDenied:true,foreignNamespaceDenied:true,writeDenied:true,productConnectorVerified:false}));
 }else throw new Error('Use up, stop or test');
}finally{if(await digestGlobal()!==globalBefore)throw new Error('Global kubeconfig changed unexpectedly; investigate before continuing.');}
