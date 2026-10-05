import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateDeliveryState } from '../src/core/cicd-control-plane.js';

const sha='a'.repeat(40);
const active={deployment:{id:'dep',versions:[{versionId:'v1',percentage:100}]}};

test('CP5 correlates exact SHA across CI and deploy before declaring success',()=>{
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha,status:'completed',conclusion:'success'},runtime:active}).state,'success');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha:'b'.repeat(40),status:'completed',conclusion:'success'},runtime:active}).state,'mismatch');
});

test('CP5 never promotes pending, failed, or missing evidence to success',()=>{
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'in_progress'},deploy:{sha,status:'queued'},runtime:active}).state,'pending');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'failure'},deploy:{sha,status:'completed',conclusion:'success'},runtime:active}).state,'failed');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:null,deploy:null,runtime:null}).state,'unknown');
});

test('CP5 flags runtime traffic that is absent or split as mismatch',()=>{
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha,status:'completed',conclusion:'success'},runtime:{deployment:null}}).state,'mismatch');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha,status:'completed',conclusion:'success'},runtime:{deployment:{versions:[{versionId:'v1',percentage:50},{versionId:'v2',percentage:50}]}}}).state,'mismatch');
});


test('CP5 Cloudflare plugin exposes owner delivery view from live provider evidence', async()=>{
  const { createCloudflarePlugin } = await import('../src/plugins/cloudflare/plugin.js');
  const target='c'.repeat(40);
  const github={
    async listRepositories(){return [{id:'123',name:'nexa-dev-bot',defaultBranch:'main'}]},
    async listCommits(){return [{fullSha:target}]},
    async listWorkflowRuns(){return [
      {name:'CI',branch:'main',fullSha:target,sha:target.slice(0,7),status:'completed',conclusion:'success'},
      {name:'Deploy Cloudflare Worker',branch:'main',fullSha:target,sha:target.slice(0,7),status:'completed',conclusion:'success'}
    ]}
  };
  const cloudflare={isConfigured(){return true},async getWorkerSnapshot(){return {workerName:'nexa-dev-bot',deployment:{id:'dep',versions:[{versionId:'v1',percentage:100}]},version:{id:'v1'},bindings:[],observability:{}}}};
  const plugin=createCloudflarePlugin({cloudflare,github});
  const route=plugin.resolveCallback('cf:delivery');
  assert.equal(route.actionId,'cloudflare.delivery.status');
  const view=await route.execute();
  assert.match(view.text,/SUCCESS|موفق/i);
  assert.match(view.text,new RegExp(target.slice(0,12)));
});
