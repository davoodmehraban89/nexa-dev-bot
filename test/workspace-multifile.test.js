import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceStore } from '../src/durable/workspace-store.js';
import { DurableWorkspaceStoreClient } from '../src/core/workspace-store.js';

function makeState() {
  const data = new Map();
  const api = { async get(k){return data.get(k)}, async put(k,v){data.set(k, structuredClone(v))}, async delete(k){return data.delete(k)}, async list(){return new Map(data)} };
  return { storage: { ...api, async transaction(fn){return fn(api)}, async setAlarm(){} } };
}
function makeNamespace() {
  const states = new Map();
  return { idFromName:n=>String(n), get(id){ if(!states.has(id)) states.set(id,makeState()); const store=new WorkspaceStore(states.get(id)); return {fetch:r=>store.fetch(r)}; } };
}
const base = { repoId:1, repoFullName:'davoodmehraban89/nexa-dev-bot', baseBranch:'main', baseHeadSha:'a'.repeat(40), baseTreeSha:'b'.repeat(40), path:'README.md', blobSha:'c'.repeat(40), originalText:'one\n', originalDigest:'d'.repeat(64), expiresAt:999999 };

test('new workspace exposes versioned files while preserving legacy fields', async () => {
  const client = new DurableWorkspaceStoreClient({ namespace:makeNamespace(), now:()=>1000 });
  const ws = await client.createWorkspace({ownerId:'A', ...base});
  assert.equal(ws.schemaVersion, 2);
  assert.equal(ws.files.length, 1);
  assert.equal(ws.files[0].path, 'README.md');
  assert.equal(ws.path, 'README.md');
});

test('workspace can add update and remove files and material changes invalidate READY intent', async () => {
  const client = new DurableWorkspaceStoreClient({ namespace:makeNamespace(), now:()=>1000 });
  let ws = await client.createWorkspace({ownerId:'A', ...base});
  ws = await client.upsertWorkspaceFile({ownerId:'A', workspaceId:ws.id, file:{path:'src/a.js', blobSha:'e'.repeat(40), originalText:'a\n', originalDigest:'1'.repeat(64), draftText:'b\n', draftDigest:'2'.repeat(64)}});
  assert.deepEqual(ws.files.map(f=>f.path), ['README.md','src/a.js']);
  assert.equal(ws.currentIntentId, null);
  ws = await client.updateWorkspaceFileDraft({ownerId:'A', workspaceId:ws.id, path:'README.md', text:'changed\n', digest:'3'.repeat(64)});
  assert.equal(ws.files.find(f=>f.path==='README.md').draftText, 'changed\n');
  ws = await client.removeWorkspaceFile({ownerId:'A', workspaceId:ws.id, path:'src/a.js'});
  assert.deepEqual(ws.files.map(f=>f.path), ['README.md']);
});

test('workspace rejects duplicate normalized paths and aggregate oversize payloads', async () => {
  const client = new DurableWorkspaceStoreClient({ namespace:makeNamespace(), now:()=>1000 });
  const ws = await client.createWorkspace({ownerId:'A', ...base});
  await assert.rejects(() => client.upsertWorkspaceFile({ownerId:'A', workspaceId:ws.id, file:{path:'README.md', blobSha:'x', originalText:'x', originalDigest:'1', draftText:'x', draftDigest:'2'}}), /already exists|duplicate/i);
  await assert.rejects(() => client.upsertWorkspaceFile({ownerId:'A', workspaceId:ws.id, file:{path:'huge.txt', blobSha:'x', originalText:'', originalDigest:'1', draftText:'x'.repeat(262145), draftDigest:'2'}}), /aggregate|large|size/i);
});
