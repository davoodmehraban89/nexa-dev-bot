import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableWorkspaceStoreClient } from '../src/core/workspace-store.js';
import { WorkspaceStore } from '../src/durable/workspace-store.js';

function makeState() {
  const data = new Map();
  const api = {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async delete(key) { return data.delete(key); },
    async list() { return new Map(data); }
  };
  return {
    storage: {
      ...api,
      async transaction(fn) { return fn(api); },
      async setAlarm() {}
    }
  };
}

function makeNamespace() {
  const states = new Map();
  return {
    idFromName(name) { return String(name); },
    get(id) {
      if (!states.has(id)) states.set(id, makeState());
      const store = new WorkspaceStore(states.get(id));
      return { fetch: request => store.fetch(request) };
    }
  };
}

test('durable workspace store accepts draft_file as an owner-scoped pending input mode', async () => {
  const client = new DurableWorkspaceStoreClient({ namespace: makeNamespace(), now: () => 1000 });
  const workspace = await client.createWorkspace({
    ownerId: '42',
    repoId: 123,
    repoFullName: 'davood/demo',
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    baseTreeSha: 'b'.repeat(40),
    path: '.gitignore',
    blobSha: 'c'.repeat(40),
    originalText: 'node_modules/\n',
    originalDigest: 'd'.repeat(64),
    expiresAt: 1000 + 30 * 60_000
  });

  await client.setPendingInput({ ownerId: '42', workspaceId: workspace.id, mode: 'draft_file' });
  assert.deepEqual(await client.getPendingInput({ ownerId: '42' }), {
    workspaceId: workspace.id,
    mode: 'draft_file'
  });
  assert.equal(await client.consumePendingInput({ ownerId: '42', workspaceId: workspace.id, mode: 'draft_file' }), true);
});