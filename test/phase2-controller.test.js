import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceController } from '../src/plugins/github/workspace.js';

const ws = { id:'W000000001', repoId:1, repoFullName:'o/r', baseBranch:'main', baseHeadSha:'a'.repeat(40), baseTreeSha:'b'.repeat(40), state:'DRAFT', path:'README.md', originalText:'one', draftText:'two', commitMessage:'msg', files:[{path:'README.md',blobSha:'c'.repeat(40),originalText:'one',draftText:'two',draftDigest:'1'.repeat(64)},{path:'src/a.js',blobSha:'d'.repeat(40),originalText:'a',draftText:'b',draftDigest:'2'.repeat(64)}] };

test('workspace view lists every change-set file and exposes add control', async()=>{
 const workspaces={async getWorkspace(){return structuredClone(ws)},async createNavigationRefs({refs}){return refs.map((_,i)=>({refId:`R00000000${i}`}))}};
 const c=createWorkspaceController({github:{},workspaces,editorUrl:'https://example.com/editor'});
 const v=await c.resolveCallback('ws:W000000001',{ownerId:'42'}).execute();
 assert.match(v.text,/README\.md/); assert.match(v.text,/src\/a\.js/); assert.match(v.text,/2 فایل/);
 assert.ok(v.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='wfiles:W000000001:1'));
});

test('adding a file reads pinned source then upserts durable workspace only', async()=>{
 const calls=[];
 const workspaces={async resolveNavigationRef(){return {repoId:1,path:'src/b.js',type:'workspace-add',workspaceId:'W000000001'}},async getWorkspace(){return structuredClone(ws)},async upsertWorkspaceFile(x){calls.push(['upsert',x]);return {...ws,files:[...ws.files,x.file]}},async createNavigationRefs({refs}){return refs.map((_,i)=>({refId:`R00000000${i}`}))}};
 const github={async getRepository(){return {fullName:'o/r',defaultBranch:'main'}},async getBranchSnapshot(){return {headSha:ws.baseHeadSha,treeSha:ws.baseTreeSha}},async getFileAtRef(_r,path){calls.push(['read',path]);return {path,sha:'e'.repeat(40),content:'safe',size:4}}};
 const c=createWorkspaceController({github,workspaces});
 const v=await c.resolveCallback('wadd:R000000001',{ownerId:'42'}).execute();
 assert.equal(calls[0][0],'read'); assert.equal(calls[1][0],'upsert'); assert.match(v.text,/اضافه|added/i);
});

test('removing a change-set file uses opaque ref and durable remove', async()=>{
 let removed='';
 const workspaces={async resolveNavigationRef(){return {workspaceId:'W000000001',path:'src/a.js',type:'workspace-file'}},async removeWorkspaceFile({path}){removed=path;return {...ws,files:[ws.files[0]]}},async createNavigationRefs({refs}){return refs.map((_,i)=>({refId:`R00000000${i}`}))}};
 const c=createWorkspaceController({github:{},workspaces});
 const v=await c.resolveCallback('wremove:R000000001',{ownerId:'42'}).execute();
 assert.equal(removed,'src/a.js'); assert.match(v.text,/README\.md/);
});


test('add-file callback actions are declared READ in the GitHub manifest', async()=>{
 const { githubPluginManifest } = await import('../src/plugins/github/manifest.js');
 for (const action of ['github.workspace.file.pick','github.workspace.file.add','github.workspace.file.remove']) {
   assert.equal(githubPluginManifest.actions[action]?.risk, 'READ', action + ' must be routed as owner-only READ');
 }
});


test('file picker rejects a repo id that is not bound to the workspace', async()=>{
 const workspaces={async getWorkspace(){return structuredClone(ws)}};
 const c=createWorkspaceController({github:{async listFiles(){throw new Error('must not read mismatched repo')}},workspaces});
 await assert.rejects(()=>c.resolveCallback('wfiles:W000000001:2',{ownerId:'42'}).execute(),/repository mismatch/i);
});

test('file picker lists candidates from the exact workspace base snapshot', async()=>{
 let seen;
 const workspaces={async getWorkspace(){return structuredClone(ws)},async createNavigationRefs({refs}){return refs.map((_,i)=>({refId:'R'+String(i).padStart(9,'0')}))}};
 const github={async listFiles(repoId,path,options){seen={repoId,path,options};return [{type:'file',path:'src/new.js',sha:'e'.repeat(40)}]}};
 const c=createWorkspaceController({github,workspaces});
 await c.resolveCallback('wfiles:W000000001:1',{ownerId:'42'}).execute();
 assert.deepEqual(seen,{repoId:1,path:'',options:{ref:ws.baseHeadSha}});
});

test('multi-file workspace exposes a direct editor button for every file', async()=>{
 const workspaces={async getWorkspace(){return structuredClone(ws)},async createNavigationRefs({refs}){return refs.map((_,i)=>({refId:'R'+String(i).padStart(9,'0')}))}};
 const c=createWorkspaceController({github:{},workspaces,editorUrl:'https://example.com/workspace/editor'});
 const v=await c.resolveCallback('ws:W000000001',{ownerId:'42'}).execute();
 const editors=v.reply_markup.inline_keyboard.flat().filter(button=>button.web_app?.url);
 assert.equal(editors.length,2);
 assert.equal(editors[0].web_app.url,'https://example.com/workspace/editor?workspaceId=W000000001&path=README.md');
 assert.equal(editors[1].web_app.url,'https://example.com/workspace/editor?workspaceId=W000000001&path=src%2Fa.js');
 assert.match(editors[1].text,/src\/a\.js/);
});
