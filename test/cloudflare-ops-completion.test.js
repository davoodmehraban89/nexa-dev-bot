import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareService } from '../src/plugins/cloudflare/service.js';
import { createCloudflarePlugin } from '../src/plugins/cloudflare/plugin.js';
import { cloudflarePluginManifest } from '../src/plugins/cloudflare/manifest.js';

const cf=(result,status=200)=>new Response(JSON.stringify({success:status<400,result,errors:status<400?[]:[{message:'bad'}]}),{status});
const uuid='11111111-1111-4111-8111-111111111111';

test('CP4 service lists versions and deploys exact known version at 100 percent then verifies it',async()=>{
  const calls=[];
  const service=new CloudflareService({token:'token',accountId:'acct',workerName:'nexa-dev-bot',fetchImpl:async(url,opt={})=>{
    calls.push({url:String(url),method:opt.method||'GET',body:opt.body});
    if((opt.method||'GET')==='POST') return cf({id:'dep-new',versions:[{version_id:uuid,percentage:100}]});
    if(String(url).endsWith('/deployments')) return cf({deployments:[{id:'dep-new',created_on:'2026-10-05T00:00:00Z',versions:[{version_id:uuid,percentage:100}]}]});
    if(String(url).endsWith('/versions')) return cf({items:[{id:uuid,created_on:'2026-10-04T00:00:00Z'}]});
    if(String(url).endsWith('/settings')) return cf({bindings:[{name:'SECRET',type:'secret_text'}],observability:{enabled:true,logs:{enabled:true,invocation_logs:true}}});
    return cf(null,404);
  }});
  const versions=await service.listVersions();
  assert.equal(versions[0].id,uuid);
  const deployed=await service.deployVersion(uuid);
  assert.equal(deployed.versionId,uuid);
  assert.equal(calls.find(c=>c.method==='POST').body.includes(uuid),true);
  assert.deepEqual((await service.getWorkerSnapshot()).bindings,[{name:'SECRET',type:'secret_text'}]);
});

test('CP4 plugin declares deploy as DESTRUCTIVE and read drill-down stays source-backed',async()=>{
  assert.equal(cloudflarePluginManifest.actions['cloudflare.worker.deploy_version']?.risk,'DESTRUCTIVE');
  const cloudflare={
    isConfigured(){return true},
    async getWorkerSnapshot(){return {workerName:'nexa-dev-bot',deployment:{id:'dep',versions:[{versionId:uuid,percentage:100}]},version:{id:uuid},bindings:[],observability:{}}},
    async listVersions(){return [{id:uuid,createdOn:'2026-10-04T00:00:00Z',triggeredBy:'upload'}]},
    async deployVersion(){throw new Error('must not run before approval')}
  };
  const plugin=createCloudflarePlugin({cloudflare});
  const list=plugin.resolveCallback('cf:versions');
  assert.equal(list.actionId,'cloudflare.worker.versions');
  const view=await list.execute();
  assert.ok(view.reply_markup.inline_keyboard.flat().some(b=>b.callback_data===`cfdeploy:${uuid}`));
  const mutation=plugin.resolveCallback(`cfdeploy:${uuid}`);
  assert.equal(mutation.actionId,'cloudflare.worker.deploy_version');
  assert.deepEqual(mutation.approval.input,{versionId:uuid});
});

test('CP4 provider errors never become fake success',async()=>{
  const service=new CloudflareService({token:'token',accountId:'acct',workerName:'nexa-dev-bot',fetchImpl:async()=>cf(null,409)});
  await assert.rejects(()=>service.deployVersion(uuid),/409|bad/i);
});
