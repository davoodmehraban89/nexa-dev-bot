import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableWorkspaceStoreClient } from '../src/core/workspace-store.js';
import { WorkspaceStore } from '../src/durable/workspace-store.js';
import { KillSwitchGuidedNexaDevBot } from '../src/kill-switch-bot.js';
import { GitHubService } from '../src/github.js';
import {
  createWorkspaceController,
  commitWorkspaceIntent
} from '../src/plugins/github/workspace.js';
import {
  WORKSPACE_EDITOR_LIMITS,
  digestText
} from '../src/core/workspace-policy.js';
import {
  makeReplayState,
  makeReplayNamespace
} from './helpers/replay-namespace.js';

const api = await import('../src/studio-api.js').catch(() => ({}));
const BOT_TOKEN = '123456:studio-test-token';
const OWNER = '42';
const NOW = Date.parse('2026-10-26T12:00:00Z');
const HEAD = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const BLOB = 'c'.repeat(40);

async function signedInitData({ userId = 42, age = 0 } = {}) {
  const fields = new URLSearchParams({
    auth_date: String(Math.floor(NOW / 1000) - age),
    user: JSON.stringify({ id: userId, first_name: 'Owner' })
  });
  const encode = (value) => new TextEncoder().encode(value);
  const sign = async (keyBytes, value) => {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, encode(value)));
  };
  const check = [...fields.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const signature = await sign(
    await sign(encode('WebAppData'), BOT_TOKEN),
    check
  );
  fields.set(
    'hash',
    [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  );
  return fields.toString();
}

function fixture() {
  let currentTime = NOW;
  const states = new Map();
  const namespace = {
    idFromName: (id) => String(id),
    get(id) {
      if (!states.has(id)) states.set(id, makeReplayState());
      return {
        fetch: (request) => new WorkspaceStore(states.get(id)).fetch(request)
      };
    }
  };
  const workspaces = new DurableWorkspaceStoreClient({
    namespace,
    now: () => currentTime
  });
  const calls = [];
  const repository = {
    id: '123',
    name: 'repo',
    fullName: 'owner/repo',
    defaultBranch: 'main',
    private: true
  };
  const github = {
    async listRepositories() {
      calls.push('repos');
      return [repository];
    },
    async getRepository(repoId) {
      calls.push('repo');
      return { ...repository, id: String(repoId) };
    },
    async listFiles(repoId, path, options) {
      calls.push(['tree', repoId, path, options]);
      return Array.from({ length: 35 }, (_, i) => ({
        name: `file-${i}.js`,
        path: path ? `${path}/file-${i}.js` : `file-${i}.js`,
        type: 'file',
        size: 7,
        sha: BLOB
      }));
    },
    async getBranchSnapshot() {
      calls.push('snapshot');
      return { headSha: HEAD, treeSha: TREE };
    },
    async getFileAtRef(repoId, path, ref) {
      calls.push(['file', repoId, path, ref]);
      return { path, content: 'before\n', size: 7, sha: BLOB };
    },
    async createGitBlob() {
      throw new Error('Unexpected provider write');
    },
    async createGitTree() {
      throw new Error('Unexpected provider write');
    },
    async createGitCommit() {
      throw new Error('Unexpected provider write');
    },
    async createGitRef() {
      throw new Error('Unexpected provider write');
    }
  };
  const env = {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    OWNER_TELEGRAM_ID: OWNER,
    APPROVAL_SIGNING_SECRET: 'studio-approval-test-secret',
    WORKSPACE_STORE: namespace,
    APPROVAL_REPLAY_GUARD: makeReplayNamespace()
  };
  const bot = new KillSwitchGuidedNexaDevBot(env);
  Object.assign(bot.github, github);
  bot.approvals.now = () => currentTime;
  bot.audit.sink = () => {};
  const messages = [];
  bot.telegram.sendMessage = async (...args) => {
    messages.push(args);
    return { ok: true };
  };
  return {
    env,
    github,
    workspaces,
    bot,
    calls,
    messages,
    states,
    now: () => currentTime,
    advance: (ms) => {
      currentTime += ms;
    }
  };
}

async function request(
  f,
  path = '',
  { method = 'GET', body, headers = {}, auth = {} } = {}
) {
  assert.equal(
    typeof api.handleStudioApiRequest,
    'function',
    'Studio API handler exists'
  );
  return api.handleStudioApiRequest(
    new Request(`https://studio.test/api/v1/studio${path}`, {
      method,
      headers: {
        'x-telegram-init-data': await signedInitData(auth),
        ...headers
      },
      ...(body !== undefined
        ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
        : {})
    }),
    f
  );
}

async function create(f) {
  const tree = await (await request(f, '/tree?repoId=123')).json();
  const response = await request(f, '/workspaces', {
    method: 'POST',
    body: { refId: tree.items[0].refId }
  });
  assert.equal(response.status, 200);
  return (await response.json()).workspace;
}

test('Studio authenticates signed, fresh owner initData before touching providers or durable objects on every route', async () => {
  const routes = [
    ['', 'GET'],
    ['/repos', 'GET'],
    ['/tree?repoId=123', 'GET'],
    ['/workspaces', 'POST'],
    ['/workspaces/W123456789', 'GET'],
    ['/workspaces/W123456789/files', 'PUT'],
    ['/workspaces/W123456789/files', 'POST'],
    ['/workspaces/W123456789/diff', 'GET'],
    ['/workspaces/W123456789/message', 'PUT'],
    ['/workspaces/W123456789/approval', 'POST'],
    ['/workspaces/W123456789', 'DELETE']
  ];
  for (const auth of [{ userId: 99 }, { age: 3601 }]) {
    for (const [path, method] of routes) {
      const f = fixture();
      const response = await request(f, path, {
        method,
        auth,
        body: method === 'GET' ? undefined : {}
      });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.deepEqual(f.calls, []);
      assert.equal(f.states.size, 0);
      assert.equal(f.messages.length, 0);
    }
  }
  const f = fixture();
  const missing = await request(f, '/repos', {
    headers: { 'x-telegram-init-data': '' }
  });
  assert.equal(missing.status, 403);
  assert.deepEqual(f.calls, []);
});

test('Studio bootstrap, complete repository listing and directory refs expose only structured owner-scoped data', async () => {
  const f = fixture();
  const bootstrap = await (await request(f)).json();
  assert.equal(bootstrap.ok, true);
  assert.equal(bootstrap.user.name, 'Owner');
  assert.deepEqual(bootstrap.limits, WORKSPACE_EDITOR_LIMITS);
  assert.equal(typeof bootstrap.version, 'string');
  const repositories = await (await request(f, '/repos')).json();
  assert.equal(repositories.repositories[0].fullName, 'owner/repo');
  const tree = await (await request(f, '/tree?repoId=123&path=src')).json();
  assert.equal(tree.items.length, 35);
  assert.equal(tree.path, 'src');
  assert.equal(tree.repository.id, '123');
  assert.match(tree.items[34].refId, /^[A-Za-z0-9_-]{10}$/);
  assert.deepEqual(
    await f.workspaces.resolveNavigationRef({
      ownerId: '99',
      refId: tree.items[0].refId
    }),
    null
  );
});

test('Studio creates pinned workspaces and refuses expired or foreign refs without provider reads', async () => {
  const f = fixture();
  const workspace = await create(f);
  assert.equal(workspace.baseHeadSha, HEAD);
  assert.equal(workspace.files[0].draftText, 'before\n');
  assert.equal(workspace.files[0].revision, 0);
  assert.equal(Object.hasOwn(workspace.files[0], 'originalText'), false);
  assert.equal(Object.hasOwn(workspace, 'originalText'), false);
  const foreign = await f.workspaces.createNavigationRefs({
    ownerId: '99',
    refs: [{ repoId: 123, path: 'secret.js', type: 'file' }]
  });
  f.calls.length = 0;
  const denied = await request(f, '/workspaces', {
    method: 'POST',
    body: { refId: foreign[0].refId }
  });
  assert.equal(denied.status, 404);
  assert.deepEqual(f.calls, []);
  const [ref] = await f.workspaces.createNavigationRefs({
    ownerId: OWNER,
    ttlMs: 1,
    refs: [{ repoId: 123, path: 'old.js', type: 'file' }]
  });
  f.advance(2);
  assert.equal(
    (
      await request(f, '/workspaces', {
        method: 'POST',
        body: { refId: ref.refId }
      })
    ).status,
    404
  );
  assert.deepEqual(f.calls, []);
});

test('Studio enforces If-Match, membership, edit policy, diff, normalized messages and immediate deletion', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  assert.equal(
    (
      await request(f, `${base}/files`, {
        method: 'PUT',
        body: { path: workspace.path, text: 'after\n' }
      })
    ).status,
    428
  );
  assert.equal(
    (
      await request(f, `${base}/files`, {
        method: 'PUT',
        headers: { 'If-Match': '0' },
        body: { path: 'missing.js', text: 'after\n' }
      })
    ).status,
    400
  );
  const update = await request(f, `${base}/files`, {
    method: 'PUT',
    headers: { 'If-Match': '"0"' },
    body: { path: workspace.path, text: 'after\n' }
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).workspace.files[0].revision, 1);
  assert.equal(
    (
      await request(f, `${base}/files`, {
        method: 'PUT',
        headers: { 'If-Match': '0' },
        body: { path: workspace.path, text: 'stale\n' }
      })
    ).status,
    409
  );
  assert.equal(
    (
      await request(f, `${base}/files`, {
        method: 'PUT',
        headers: { 'If-Match': '1' },
        body: { path: workspace.path, text: 'x'.repeat(20001) }
      })
    ).status,
    422
  );
  const diff = await (await request(f, `${base}/diff`)).json();
  assert.equal(diff.ok, true);
  assert.match(JSON.stringify(diff.diff), /after/);
  const message = await (
    await request(f, `${base}/message`, {
      method: 'PUT',
      body: { message: '  edit\n  file  ' }
    })
  ).json();
  assert.equal(message.workspace.commitMessage, 'edit file');
  assert.equal((await request(f, `/workspaces/W123456789`)).status, 404);
  assert.equal((await request(f, base, { method: 'DELETE' })).status, 200);
  assert.equal((await request(f, base)).status, 404);
});

test('Studio workspace file refs are scoped to the same workspace and pinned repository', async () => {
  const f = fixture();
  const first = await create(f);
  const second = await create(f);
  f.calls.length = 0;
  assert.equal(
    (await request(f, `/tree?repoId=456&workspaceId=${first.id}`)).status,
    400
  );
  assert.deepEqual(f.calls, []);
  const tree = await (
    await request(f, `/tree?repoId=123&path=src&workspaceId=${first.id}`)
  ).json();
  const refId = tree.items[0].refId;
  const saved = await f.workspaces.resolveNavigationRef({
    ownerId: OWNER,
    refId
  });
  assert.equal(saved.type, 'workspace-add');
  assert.equal(saved.workspaceId, first.id);
  assert.equal(
    (
      await request(f, `/workspaces/${second.id}/files`, {
        method: 'POST',
        body: { refId }
      })
    ).status,
    400
  );
  const added = await (
    await request(f, `/workspaces/${first.id}/files`, {
      method: 'POST',
      body: { refId }
    })
  ).json();
  assert.equal(added.workspace.files.length, 2);
  assert.equal(added.workspace.files[1].path, 'src/file-0.js');
  assert.equal(f.calls.at(-1)[3], HEAD);
});

test('Studio concurrent file additions enforce the durable file limit and return a bounded policy response', async () => {
  const f = fixture();
  const workspace = await create(f);
  const refs = await f.workspaces.createNavigationRefs({
    ownerId: OWNER,
    refs: Array.from({ length: 8 }, (_, i) => ({
      repoId: 123,
      workspaceId: workspace.id,
      path: `extra-${i}.js`,
      type: 'workspace-add'
    }))
  });
  const add = (refId) =>
    request(f, `/workspaces/${workspace.id}/files`, {
      method: 'POST',
      body: { refId }
    });
  for (const ref of refs.slice(0, 6))
    assert.equal((await add(ref.refId)).status, 200);
  const responses = await Promise.all(
    refs.slice(6).map((ref) => add(ref.refId))
  );
  assert.deepEqual(responses.map((result) => result.status).sort(), [200, 422]);
  const saved = await f.workspaces.getWorkspace({
    ownerId: OWNER,
    workspaceId: workspace.id
  });
  assert.equal(saved.files.length, WORKSPACE_EDITOR_LIMITS.maxFiles);
});

test('Studio approval seals immutable intent and sends only a signed approval to the fixed private owner without executing writes', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  await request(f, `${base}/files`, {
    method: 'PUT',
    headers: { 'If-Match': '0' },
    body: { path: workspace.path, text: 'after\n' }
  });
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'edit file' }
  });
  assert.equal(
    (await request(f, `${base}/approval`, { method: 'POST', body: {} })).status,
    400
  );
  assert.equal(f.messages.length, 0);
  assert.equal(
    (
      await f.workspaces.getWorkspace({
        ownerId: OWNER,
        workspaceId: workspace.id
      })
    ).currentIntentId,
    null
  );
  const { review } = await (await request(f, `${base}/diff`)).json();
  for (const message of [undefined, null, 7]) {
    assert.equal(
      (
        await request(f, `${base}/approval`, {
          method: 'POST',
          body: { review, message }
        })
      ).status,
      400
    );
  }
  f.calls.length = 0;
  const response = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review, message: '  edit\nfile  ' }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.approvalRequested, true);
  assert.equal(body.workspaceId, workspace.id);
  assert.equal(body.targetBranch, `nexa/edit-${workspace.id}`);
  assert.equal(body.baseHeadSha, HEAD);
  assert.equal(body.expiresAt, NOW + 120_000);
  assert.equal(JSON.stringify(body).includes('approve:'), false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0][0], OWNER);
  assert.equal(f.messages[0][1].includes('after'), false);
  const button = f.messages[0][2].inline_keyboard
    .flat()
    .find((value) => value.callback_data?.startsWith('approve:'));
  assert.ok(button);
  const approved = await f.bot.approvals.verify(button.callback_data.slice(8), {
    ownerId: OWNER
  });
  assert.equal(approved.actionId, 'github.workspace.commit_branch');
  assert.equal(approved.risk, 'WRITE');
  const sealed = await f.workspaces.getWorkspace({
    ownerId: OWNER,
    workspaceId: workspace.id
  });
  assert.equal(approved.input.intentId, sealed.currentIntentId);
  const intent = await f.workspaces.getIntent({
    ownerId: OWNER,
    intentId: sealed.currentIntentId
  });
  assert.equal(intent.baseHeadSha, HEAD);
  assert.equal(intent.state, 'READY');
  assert.equal(intent.commitMessageDigest, await digestText('edit file'));
  assert.equal(
    (
      await request(f, `${base}/approval`, {
        method: 'POST',
        body: { review, chatId: '-100', approved: true }
      })
    ).status,
    400
  );
  assert.equal(f.messages.length, 1);
});

test('Studio rejects oversized and malformed bodies and hides provider errors and draft source', async () => {
  const f = fixture();
  assert.equal(
    (await request(f, '/workspaces', { method: 'POST', body: '{' })).status,
    400
  );
  assert.equal(
    (
      await request(f, '/workspaces', {
        method: 'POST',
        body: 'x'.repeat(5000)
      })
    ).status,
    413
  );
  f.github.listRepositories = async () => {
    throw new Error('github_pat_secret draft source');
  };
  const response = await request(f, '/repos');
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('github_pat_secret'), false);
});

test('Studio approval delivery and metadata failures return bounded errors without leaking the token or source', async () => {
  for (const failAt of ['delivery', 'metadata']) {
    const f = fixture();
    const workspace = await create(f);
    const base = `/workspaces/${workspace.id}`;
    await request(f, `${base}/files`, {
      method: 'PUT',
      headers: { 'If-Match': '0' },
      body: { path: workspace.path, text: 'after\n' }
    });
    await request(f, `${base}/message`, {
      method: 'PUT',
      body: { message: 'edit file' }
    });
    const { review } = await (await request(f, `${base}/diff`)).json();
    if (failAt === 'delivery')
      f.bot.telegram.sendMessage = async () => {
        throw new Error('secret-token source-text');
      };
    else
      f.bot.router.dispatchCallback = async () => ({ requiresApproval: false });
    const response = await request(f, `${base}/approval`, {
      method: 'POST',
      body: { review, message: 'edit file' }
    });
    assert.equal(response.status, failAt === 'delivery' ? 502 : 503);
    const body = await response.text();
    assert.equal(body.includes('secret-token'), false);
    assert.equal(body.includes('source-text'), false);
  }
});

test('Studio approval rejects an older reviewed diff after another tab saves and requires a fresh diff', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  const save = (revision, text) =>
    request(f, `${base}/files`, {
      method: 'PUT',
      headers: { 'If-Match': String(revision) },
      body: { path: workspace.path, text }
    });
  await save(0, 'reviewed A\n');
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'edit file' }
  });
  const oldDiff = await (await request(f, `${base}/diff`)).json();
  await save(1, 'unreviewed B\n');
  f.calls.length = 0;
  const stale = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review: oldDiff.review, message: 'edit file' }
  });
  assert.equal(stale.status, 409);
  assert.equal(f.messages.length, 0);
  assert.deepEqual(f.calls, []);
  const currentDiff = await (await request(f, `${base}/diff`)).json();
  assert.deepEqual(currentDiff.review, {
    baseHeadSha: HEAD,
    files: [{ path: workspace.path, revision: 2 }]
  });
  const fresh = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review: currentDiff.review, message: 'edit file' }
  });
  assert.equal(fresh.status, 200);
  assert.equal(f.messages.length, 1);
});

test('Studio review comparison is atomic when a save races intent sealing', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  await request(f, `${base}/files`, {
    method: 'PUT',
    headers: { 'If-Match': '0' },
    body: { path: workspace.path, text: 'reviewed A\n' }
  });
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'edit file' }
  });
  const { review } = await (await request(f, `${base}/diff`)).json();
  const seal = f.workspaces.sealIntent.bind(f.workspaces);
  f.workspaces.sealIntent = async (input) => {
    await f.workspaces.updateWorkspaceFileDraft({
      ownerId: OWNER,
      workspaceId: workspace.id,
      path: workspace.path,
      text: 'racing B\n',
      digest: 'new-digest',
      expectedRevision: 1
    });
    return seal(input);
  };
  const response = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review, message: 'edit file' }
  });
  assert.equal(response.status, 409);
  assert.equal(f.messages.length, 0);
  assert.equal(
    (
      await f.workspaces.getWorkspace({
        ownerId: OWNER,
        workspaceId: workspace.id
      })
    ).currentIntentId,
    null
  );
});

test('Studio approval binds the displayed commit message when another tab changes it during sealing', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  await request(f, `${base}/files`, {
    method: 'PUT',
    headers: { 'If-Match': '0' },
    body: { path: workspace.path, text: 'reviewed file\n' }
  });
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'reviewed message A' }
  });
  const { review } = await (await request(f, `${base}/diff`)).json();
  const seal = f.workspaces.sealIntent.bind(f.workspaces);
  f.workspaces.sealIntent = async (input) => {
    await f.workspaces.setCommitMessage({
      ownerId: OWNER,
      workspaceId: workspace.id,
      message: 'unreviewed message B',
      digest: await digestText('unreviewed message B')
    });
    return seal(input);
  };
  const response = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review, message: 'reviewed message A' }
  });
  assert.equal(response.status, 409);
  assert.equal(f.messages.length, 0);
  const current = await f.workspaces.getWorkspace({
    ownerId: OWNER,
    workspaceId: workspace.id
  });
  assert.equal(current.currentIntentId, null);
  assert.equal(current.commitMessage, 'unreviewed message B');
});

test('Studio approval rejects a message changed after its displayed value was saved', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  await request(f, `${base}/files`, {
    method: 'PUT',
    headers: { 'If-Match': '0' },
    body: { path: workspace.path, text: 'reviewed file\n' }
  });
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'reviewed message A' }
  });
  const { review } = await (await request(f, `${base}/diff`)).json();
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'unreviewed message B' }
  });
  const issued = [];
  const issue = f.bot.approvals.issue.bind(f.bot.approvals);
  f.bot.approvals.issue = async (payload) => {
    const token = await issue(payload);
    issued.push(token);
    return token;
  };
  f.calls.length = 0;
  const response = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review, message: 'reviewed message A' }
  });
  assert.equal(response.status, 409);
  assert.equal((await response.text()).includes('unreviewed message B'), false);
  assert.equal(issued.length, 0);
  assert.equal(f.messages.length, 0);
  assert.deepEqual(f.calls, []);
  const current = await f.workspaces.getWorkspace({
    ownerId: OWNER,
    workspaceId: workspace.id
  });
  assert.equal(current.currentIntentId, null);
  assert.equal(current.state, 'DRAFT');
  assert.equal(current.commitMessage, 'unreviewed message B');
});

test('Studio approval rejects an unreviewed proposed message even if the current message is restored', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  await request(f, `${base}/files`, {
    method: 'PUT',
    headers: { 'If-Match': '0' },
    body: { path: workspace.path, text: 'reviewed file\n' }
  });
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'reviewed message A' }
  });
  const { review } = await (await request(f, `${base}/diff`)).json();
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'unreviewed message B' }
  });
  const seal = f.workspaces.sealIntent.bind(f.workspaces);
  f.workspaces.sealIntent = async (input) => {
    await f.workspaces.setCommitMessage({
      ownerId: OWNER,
      workspaceId: workspace.id,
      message: 'reviewed message A',
      digest: await digestText('reviewed message A')
    });
    return seal(input);
  };
  f.calls.length = 0;
  const response = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review, message: 'reviewed message A' }
  });
  assert.equal(response.status, 409);
  assert.equal(f.messages.length, 0);
  assert.deepEqual(f.calls, []);
  const current = await f.workspaces.getWorkspace({
    ownerId: OWNER,
    workspaceId: workspace.id
  });
  assert.equal(current.currentIntentId, null);
  assert.equal(current.commitMessage, 'reviewed message A');
});

test('Studio approval keeps the exact sealed intent when another tab seals a replacement', async () => {
  const f = fixture();
  const workspace = await create(f);
  const base = `/workspaces/${workspace.id}`;
  await request(f, `${base}/files`, {
    method: 'PUT',
    headers: { 'If-Match': '0' },
    body: { path: workspace.path, text: 'reviewed file\n' }
  });
  await request(f, `${base}/message`, {
    method: 'PUT',
    body: { message: 'reviewed message A' }
  });
  const { review } = await (await request(f, `${base}/diff`)).json();
  const seal = f.workspaces.sealIntent.bind(f.workspaces);
  let reviewedIntent;
  f.workspaces.sealIntent = async (input) => {
    reviewedIntent = await seal(input);
    f.workspaces.sealIntent = seal;
    await f.workspaces.setCommitMessage({
      ownerId: OWNER,
      workspaceId: workspace.id,
      message: 'unreviewed message B',
      digest: await digestText('unreviewed message B')
    });
    await createWorkspaceController(f).sealWorkspaceIntent({
      ownerId: OWNER,
      workspaceId: workspace.id
    });
    return reviewedIntent;
  };
  f.calls.length = 0;
  const response = await request(f, `${base}/approval`, {
    method: 'POST',
    body: { review, message: 'reviewed message A' }
  });
  assert.equal(response.status, 200);
  assert.equal(f.messages.length, 1);
  const button = f.messages[0][2].inline_keyboard
    .flat()
    .find((value) => value.callback_data?.startsWith('approve:'));
  const approved = await f.bot.approvals.verify(button.callback_data.slice(8), {
    ownerId: OWNER
  });
  assert.equal(approved.input.intentId, reviewedIntent.id);
  assert.equal(
    reviewedIntent.commitMessageDigest,
    await digestText('reviewed message A')
  );
  const current = await f.workspaces.getWorkspace({
    ownerId: OWNER,
    workspaceId: workspace.id
  });
  assert.notEqual(current.currentIntentId, reviewedIntent.id);
  await assert.rejects(
    commitWorkspaceIntent({
      ...f,
      ownerId: OWNER,
      repoId: 123,
      intentId: reviewedIntent.id
    }),
    /Workspace material changed/i
  );
  assert.deepEqual(f.calls, []);
});

test('Studio rejects unsafe owner configuration, malformed paths and foreign workspace identifiers', async () => {
  const f = fixture();
  f.env.OWNER_TELEGRAM_ID = '-100';
  assert.equal((await request(f, '/repos')).status, 503);
  assert.deepEqual(f.calls, []);
  assert.equal(f.states.size, 0);
  f.env.OWNER_TELEGRAM_ID = OWNER;
  for (const path of ['../secret', '/secret', 'src//a', 'src\\a', 'src\0a']) {
    assert.equal(
      (await request(f, `/tree?repoId=123&path=${encodeURIComponent(path)}`))
        .status,
      400
    );
  }
  assert.deepEqual(f.calls, []);
  const foreign = await f.workspaces.createWorkspace({
    ownerId: '99',
    repoId: 123,
    path: 'foreign.js',
    originalText: 'private',
    originalDigest: 'digest',
    baseBranch: 'main',
    baseHeadSha: HEAD,
    baseTreeSha: TREE
  });
  for (const [method, suffix, body] of [
    ['GET', '', undefined],
    ['DELETE', '', undefined],
    ['PUT', '/files', { path: 'foreign.js', text: 'attacker' }],
    ['POST', '/approval', {}]
  ]) {
    assert.equal(
      (
        await request(f, `/workspaces/${foreign.id}${suffix}`, {
          method,
          body,
          headers: { 'If-Match': '0' }
        })
      ).status,
      404
    );
  }
  assert.equal(
    (
      await f.workspaces.getWorkspace({
        ownerId: '99',
        workspaceId: foreign.id
      })
    ).draftText,
    'private'
  );
});

test('GitHub repository listing traverses all Link pages at per_page=100 without leaking credentials to another origin', async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const page = new URL(url).searchParams.get('page');
    return Response.json(
      [{ id: page === '2' ? 2 : 1, name: 'repo', full_name: 'owner/repo' }],
      {
        headers:
          page === '2'
            ? {}
            : {
                Link: '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next"'
              }
      }
    );
  };
  try {
    const repos = await new GitHubService('github_pat_test').listRepositories();
    assert.equal(repos.length, 2);
    assert.equal(new URL(requested[0]).searchParams.get('per_page'), '100');
    assert.equal(requested.length, 2);
    requested.length = 0;
    globalThis.fetch = async (url) => {
      requested.push(String(url));
      return Response.json([], {
        headers: {
          Link: '<https://attacker.test/user/repos?page=2>; rel="next"'
        }
      });
    };
    await assert.rejects(
      () => new GitHubService('github_pat_test').listRepositories(),
      /pagination|page/i
    );
    assert.equal(requested.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
