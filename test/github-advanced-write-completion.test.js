import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';
import { githubPluginManifest } from '../src/plugins/github/manifest.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const repoContext={id:123,name:'nexa-dev-bot',full_name:'davoodmehraban89/nexa-dev-bot',default_branch:'main',private:true};

test('CP3 provider dispatches workflow and reruns a job using GitHub POST endpoints', async()=>{
  const calls=[]; const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{const value=String(url);calls.push({url:value,method:options.method||'GET',body:options.body});
    if(value==='https://api.github.com/repositories/123') return json(repoContext);
    if(value.endsWith('/actions/workflows/999/dispatches')) return new Response(null,{status:204});
    if(value.endsWith('/actions/jobs/88/rerun')) return new Response(null,{status:201});
    return json({message:'Not Found'},404);
  };
  try{
    const service=new GitHubService('token');
    assert.deepEqual(await service.dispatchWorkflow(123,999,{ref:'main',inputs:{mode:'safe'}}),{accepted:true,status:204});
    assert.deepEqual(await service.rerunJob(123,88),{accepted:true,status:201});
    const dispatch=calls.find(c=>c.url.endsWith('/actions/workflows/999/dispatches'));
    assert.equal(dispatch.method,'POST'); assert.deepEqual(JSON.parse(dispatch.body),{ref:'main',inputs:{mode:'safe'}});
    assert.equal(calls.find(c=>c.url.endsWith('/actions/jobs/88/rerun')).method,'POST');
  }finally{globalThis.fetch=original;}
});

test('CP3 manifest declares workflow dispatch and job rerun as WRITE',()=>{
  assert.equal(githubPluginManifest.actions['github.workflow.dispatch']?.risk,'WRITE');
  assert.equal(githubPluginManifest.actions['github.workflow.job.rerun']?.risk,'WRITE');
});

test('CP3 source-backed callbacks require approval and do not mutate provider before approval',async()=>{
  const writes=[];
  const github={
    async getWorkflowRun(){return {id:77,name:'CI',status:'completed',conclusion:'failure',branch:'main',workflowId:999,runNumber:7};},
    async getWorkflowJob(){return {id:88,name:'test',status:'completed',conclusion:'failure'};},
    async dispatchWorkflow(...args){writes.push(['dispatch',...args]);},
    async rerunJob(...args){writes.push(['job',...args]);}
  };
  const menu={async renderByCallback(){return {text:'x',reply_markup:{inline_keyboard:[]}}},async getReposListView(){return {text:'r',reply_markup:{inline_keyboard:[]}}}};
  const plugin=createGitHubPlugin({github,menu});
  const dispatch=await plugin.resolveCallback('dispatchwf:123:77');
  assert.equal(dispatch.actionId,'github.workflow.dispatch');
  assert.deepEqual(dispatch.approval.input,{repoId:123,runId:77,workflowId:999,ref:'main'});
  assert.equal(writes.length,0);
  const rerun=await plugin.resolveCallback('rerunjob:123:88');
  assert.equal(rerun.actionId,'github.workflow.job.rerun');
  assert.deepEqual(rerun.approval.input,{repoId:123,runId:88,jobId:88});
  assert.equal(writes.length,0);
});
