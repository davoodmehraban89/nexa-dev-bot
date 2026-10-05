import test from 'node:test';
import assert from 'node:assert/strict';
import { commitWorkspaceIntent } from '../src/plugins/github/workspace-commit.js';

const sha = c => c.repeat(40);

test('approved multi-file intent creates one blob per file and one atomic tree/commit', async () => {
  const calls=[];
  const workspace={id:'AbCdEf1234',repoId:7,baseBranch:'main',baseHeadSha:sha('a'),baseTreeSha:sha('b'),commitMessage:'feat: multi',commitMessageDigest:'m',currentIntentId:'AbCd1234',files:[
    {path:'a.txt',blobSha:sha('c'),draftText:'A2',draftDigest:'d1'},
    {path:'b.txt',blobSha:sha('d'),draftText:'B2',draftDigest:'d2'}
  ]};
  const intent={id:'AbCd1234',workspaceId:workspace.id,repoId:7,state:'READY',baseBranch:'main',baseHeadSha:sha('a'),baseTreeSha:sha('b'),commitMessageDigest:'m',targetBranch:'nexa/edit-AbCdEf1234',commitTimestamp:'2026-10-05T00:00:00.000Z',files:[
    {path:'a.txt',sourceBlobSha:sha('c'),contentDigest:'d1'},
    {path:'b.txt',sourceBlobSha:sha('d'),contentDigest:'d2'}
  ]};
  const workspaces={async getIntent(){return intent},async getWorkspace(){return workspace},async beginCommit(){return{disposition:'start',intent}},async setCandidateCommit(){},async completeCommit(){},async markStale(){}};
  const github={async getBranchSnapshot(){return{headSha:sha('a')}},async getGitRef(){return null},async createGitBlob(_r,text){calls.push(['blob',text]);return{sha:text==='A2'?sha('e'):sha('f')}},async createGitTree(_r,input){calls.push(['tree',input]);return{sha:sha('1')}},async createGitCommit(_r,input){calls.push(['commit',input]);return{sha:sha('2')}},async createGitBranchRef(_r,input){calls.push(['ref',input])}};
  const result=await commitWorkspaceIntent({github,workspaces,ownerId:'42',repoId:7,intentId:'AbCd1234'});
  assert.equal(result.commitSha,sha('2'));
  assert.deepEqual(calls.filter(c=>c[0]==='blob').map(c=>c[1]),['A2','B2']);
  const tree=calls.find(c=>c[0]==='tree')[1];
  assert.deepEqual(tree.entries.map(e=>e.path),['a.txt','b.txt']);
  assert.equal(calls.filter(c=>c[0]==='tree').length,1);
  assert.equal(calls.filter(c=>c[0]==='commit').length,1);
});
