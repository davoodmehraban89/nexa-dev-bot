import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let clientModule = {};
let durableModule = {};
let indexModule = {};
try { clientModule = await import('../src/core/workspace-store.js'); } catch {}
try { durableModule = await import('../src/durable/workspace-store.js'); } catch {}
try { indexModule = await import('../src/index.js'); } catch {}

const requireExport = (mod, name) => {
  assert.equal(typeof mod[name], 'function', `${name} must be implemented`);
  return mod[name];
};

function makeState() {
  const data = new Map();
  let alarm = null;
  const api = {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async delete(key) { return data.delete(key); },
    async list() { return new Map(data); }
  };
  return {
    data,
    get alarm() { return alarm; },
    storage: {
      ...api,
      async transaction(fn) { return fn(api); },
      async setAlarm(value) { alarm = value; },
      async deleteAll() { data.clear(); alarm = null; }
    }
  };
}

function makeNamespace(StoreClass, states = new Map()) {
  return {
    states,
    idFromName(name) { return String(name); },
    get(id) {
      if (!states.has(id)) states.set(id, makeState());
      const state = states.get(id);
      const instance = new StoreClass(state);
      return { fetch: request => instance.fetch(request) };
    }
  };
}

function baseWorkspace(now = 1_000) {
  return {
    repoId: 123,
    repoFullName: 'davoodmehraban89/nexa-dev-bot',
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    baseTreeSha: 'b'.repeat(40),
    path: 'README.md',
    blobSha: 'c'.repeat(40),
    originalText: 'before\n',
    originalDigest: 'd'.repeat(64),
    expiresAt: now + 30 * 60_000
  };
}

function baseIntent(workspace, overrides = {}) {
  return {
    repoId: workspace.repoId,
    workspaceId: workspace.id,
    baseBranch: workspace.baseBranch,
    baseHeadSha: workspace.baseHeadSha,
    baseTreeSha: workspace.baseTreeSha,
    path: workspace.path,
    sourceBlobSha: workspace.blobSha,
    contentDigest: '1'.repeat(64),
    commitMessageDigest: '2'.repeat(64),
    targetBranch: `nexa/edit-${workspace.id}`,
    commitTimestamp: '2026-10-03T08:00:00.000Z',
    intentDigest: '3'.repeat(64),
    ...overrides
  };
}

test('DurableWorkspaceStoreClient fails closed without WORKSPACE_STORE', async () => {
  const Client = requireExport(clientModule, 'DurableWorkspaceStoreClient');
  const client = new Client();
  assert.equal(client.isConfigured(), false);
  await assert.rejects(() => client.getWorkspace({ ownerId: 'owner', workspaceId: 'Ab3_-xYz09' }), /not configured/i);
});

test('workspace store isolates refs and workspaces by owner', async () => {
  const Client = requireExport(clientModule, 'DurableWorkspaceStoreClient');
  const Store = requireExport(durableModule, 'WorkspaceStore');
  const namespace = makeNamespace(Store);
  const client = new Client({ namespace, now: () => 1_000 });

  const [ref] = await client.createNavigationRefs({ ownerId: 'A', refs: [{ repoId: 123, path: 'src/app.js', type: 'file', sha: 'a'.repeat(40) }] });
  assert.match(ref.refId, /^[A-Za-z0-9_-]{10}$/);
  assert.equal((await client.resolveNavigationRef({ ownerId: 'A', refId: ref.refId })).path, 'src/app.js');
  assert.equal(await client.resolveNavigationRef({ ownerId: 'B', refId: ref.refId }), null);

  const workspace = await client.createWorkspace({ ownerId: 'A', ...baseWorkspace() });
  assert.match(workspace.id, /^[A-Za-z0-9_-]{10}$/);
  assert.equal((await client.getWorkspace({ ownerId: 'A', workspaceId: workspace.id })).path, 'README.md');
  assert.equal(await client.getWorkspace({ ownerId: 'B', workspaceId: workspace.id }), null);
});

test('expired refs and workspaces read as missing and schedule cleanup', async () => {
  const Client = requireExport(clientModule, 'DurableWorkspaceStoreClient');
  const Store = requireExport(durableModule, 'WorkspaceStore');
  let now = 1_000;
  const namespace = makeNamespace(Store);
  const client = new Client({ namespace, now: () => now });

  const [ref] = await client.createNavigationRefs({ ownerId: 'A', refs: [{ repoId: 1, path: 'a.txt', type: 'file', sha: 'a'.repeat(40) }], ttlMs: 50 });
  const workspace = await client.createWorkspace({ ownerId: 'A', ...baseWorkspace(now), expiresAt: now + 50 });
  now = 1_051;

  assert.equal(await client.resolveNavigationRef({ ownerId: 'A', refId: ref.refId }), null);
  assert.equal(await client.getWorkspace({ ownerId: 'A', workspaceId: workspace.id }), null);
  assert.ok(namespace.states.get('A').alarm !== null);
});

test('pending workspace input is owner scoped and consumed exactly once', async () => {
  const Client = requireExport(clientModule, 'DurableWorkspaceStoreClient');
  const Store = requireExport(durableModule, 'WorkspaceStore');
  const client = new Client({ namespace: makeNamespace(Store), now: () => 1_000 });
  const workspace = await client.createWorkspace({ ownerId: 'A', ...baseWorkspace() });

  await client.setPendingInput({ ownerId: 'A', workspaceId: workspace.id, mode: 'draft' });
  assert.deepEqual(await client.getPendingInput({ ownerId: 'A' }), { workspaceId: workspace.id, mode: 'draft' });
  assert.equal(await client.getPendingInput({ ownerId: 'B' }), null);
  assert.equal(await client.consumePendingInput({ ownerId: 'A', workspaceId: workspace.id, mode: 'draft' }), true);
  assert.equal(await client.consumePendingInput({ ownerId: 'A', workspaceId: workspace.id, mode: 'draft' }), false);
});

test('material draft or message changes invalidate READY intent while identical values reuse it', async () => {
  const Client = requireExport(clientModule, 'DurableWorkspaceStoreClient');
  const Store = requireExport(durableModule, 'WorkspaceStore');
  const client = new Client({ namespace: makeNamespace(Store), now: () => 1_000 });
  let workspace = await client.createWorkspace({ ownerId: 'A', ...baseWorkspace() });
  workspace = await client.updateDraft({ ownerId: 'A', workspaceId: workspace.id, text: 'after\n', digest: '1'.repeat(64) });
  workspace = await client.setCommitMessage({ ownerId: 'A', workspaceId: workspace.id, message: 'test: edit', digest: '2'.repeat(64) });

  const first = await client.sealIntent({ ownerId: 'A', workspaceId: workspace.id, intent: baseIntent(workspace) });
  assert.match(first.id, /^[A-Za-z0-9_-]{8}$/);
  const same = await client.sealIntent({ ownerId: 'A', workspaceId: workspace.id, intent: baseIntent(workspace) });
  assert.equal(same.id, first.id);

  await client.updateDraft({ ownerId: 'A', workspaceId: workspace.id, text: 'after\n', digest: '1'.repeat(64) });
  assert.equal((await client.getWorkspace({ ownerId: 'A', workspaceId: workspace.id })).currentIntentId, first.id);

  await client.updateDraft({ ownerId: 'A', workspaceId: workspace.id, text: 'changed\n', digest: '9'.repeat(64) });
  const changed = await client.getWorkspace({ ownerId: 'A', workspaceId: workspace.id });
  assert.equal(changed.currentIntentId, null);
  assert.equal(changed.state, 'DRAFT');
  assert.equal((await client.getIntent({ ownerId: 'A', intentId: first.id })).intentDigest, first.intentDigest);
});

test('sealed intent is immutable and beginCommit is atomic through COMMITTED result', async () => {
  const Client = requireExport(clientModule, 'DurableWorkspaceStoreClient');
  const Store = requireExport(durableModule, 'WorkspaceStore');
  const client = new Client({ namespace: makeNamespace(Store), now: () => 1_000 });
  let workspace = await client.createWorkspace({ ownerId: 'A', ...baseWorkspace() });
  workspace = await client.updateDraft({ ownerId: 'A', workspaceId: workspace.id, text: 'after\n', digest: '1'.repeat(64) });
  workspace = await client.setCommitMessage({ ownerId: 'A', workspaceId: workspace.id, message: 'test: edit', digest: '2'.repeat(64) });
  const intent = await client.sealIntent({ ownerId: 'A', workspaceId: workspace.id, intent: baseIntent(workspace) });

  const start = await client.beginCommit({ ownerId: 'A', intentId: intent.id });
  assert.equal(start.disposition, 'start');
  const resume = await client.beginCommit({ ownerId: 'A', intentId: intent.id });
  assert.equal(resume.disposition, 'resume');

  await client.setCandidateCommit({ ownerId: 'A', intentId: intent.id, commitSha: 'e'.repeat(40) });
  const completed = await client.completeCommit({ ownerId: 'A', intentId: intent.id, commitSha: 'e'.repeat(40), branch: intent.targetBranch });
  assert.equal(completed.state, 'COMMITTED');
  assert.equal(completed.commitSha, 'e'.repeat(40));
  assert.equal(completed.branch, intent.targetBranch);

  const again = await client.beginCommit({ ownerId: 'A', intentId: intent.id });
  assert.equal(again.disposition, 'committed');
  assert.equal(again.intent.commitSha, 'e'.repeat(40));

  const stored = await client.getIntent({ ownerId: 'A', intentId: intent.id });
  assert.equal(stored.intentDigest, intent.intentDigest);
  assert.equal(stored.contentDigest, intent.contentDigest);
});

test('cancelWorkspace removes draft and matching pending input', async () => {
  const Client = requireExport(clientModule, 'DurableWorkspaceStoreClient');
  const Store = requireExport(durableModule, 'WorkspaceStore');
  const client = new Client({ namespace: makeNamespace(Store), now: () => 1_000 });
  const workspace = await client.createWorkspace({ ownerId: 'A', ...baseWorkspace() });
  await client.setPendingInput({ ownerId: 'A', workspaceId: workspace.id, mode: 'commit_message' });
  await client.cancelWorkspace({ ownerId: 'A', workspaceId: workspace.id });
  assert.equal(await client.getWorkspace({ ownerId: 'A', workspaceId: workspace.id }), null);
  assert.equal(await client.getPendingInput({ ownerId: 'A' }), null);
});

test('Worker exports WorkspaceStore and Wrangler declares SQLite durable binding without legacy migrations', async () => {
  const Store = requireExport(durableModule, 'WorkspaceStore');
  assert.equal(indexModule.WorkspaceStore, Store);
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.ok(config.durable_objects?.bindings?.some(binding => binding.name === 'WORKSPACE_STORE' && binding.class_name === 'WorkspaceStore'));
  assert.deepEqual(config.exports?.WorkspaceStore, { type: 'durable-object', storage: 'sqlite' });
  assert.equal('migrations' in config, false);
});
