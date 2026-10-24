import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalService } from '../src/core/approval.js';
import { PluginRegistry } from '../src/core/plugin-registry.js';
import { ActionPolicy } from '../src/core/action-policy.js';
import { AuditLogger } from '../src/core/audit.js';
import { PluginRouter } from '../src/core/router.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';
import * as workspaceModule from '../src/plugins/github/workspace.js';

const OWNER = '42';
const REPO_ID = 123;
const WORKSPACE_ID = 'W123456789';
const INTENT_ID = 'Ab12_cdE';
const BASE_HEAD = 'a'.repeat(40);
const BASE_TREE = 'b'.repeat(40);
const SOURCE_BLOB = 'c'.repeat(40);
const CONTENT_BLOB = 'd'.repeat(40);
const NEW_TREE = 'e'.repeat(40);
const COMMIT_SHA = 'f'.repeat(40);
const TARGET_BRANCH = `nexa/edit-${WORKSPACE_ID}`;
const TIMESTAMP = '2026-10-03T09:00:00.000Z';
const CONTENT_DIGEST = '1'.repeat(64);
const MESSAGE_DIGEST = '2'.repeat(64);

function replayStore() {
  const seen = new Set();
  return {
    async consume({ ownerId, nonce }) {
      const key = `${ownerId}:${nonce}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
  };
}

function makeIntent(overrides = {}) {
  return {
    id: INTENT_ID,
    workspaceId: WORKSPACE_ID,
    repoId: REPO_ID,
    baseBranch: 'main',
    baseHeadSha: BASE_HEAD,
    baseTreeSha: BASE_TREE,
    path: 'src/app.js',
    sourceBlobSha: SOURCE_BLOB,
    contentDigest: CONTENT_DIGEST,
    commitMessageDigest: MESSAGE_DIGEST,
    targetBranch: TARGET_BRANCH,
    commitTimestamp: TIMESTAMP,
    intentDigest: '3'.repeat(64),
    state: 'READY',
    candidateCommitSha: null,
    commitSha: null,
    branch: null,
    ...overrides
  };
}

function makeWorkspace(overrides = {}) {
  return {
    id: WORKSPACE_ID,
    repoId: REPO_ID,
    currentIntentId: INTENT_ID,
    state: 'READY',
    baseBranch: 'main',
    baseHeadSha: BASE_HEAD,
    baseTreeSha: BASE_TREE,
    path: 'src/app.js',
    blobSha: SOURCE_BLOB,
    originalText: 'before\n',
    draftText: 'after\n',
    draftDigest: CONTENT_DIGEST,
    commitMessage: 'edit app',
    commitMessageDigest: MESSAGE_DIGEST,
    ...overrides
  };
}

function makeWorkspaces({
  intent = makeIntent(),
  workspace = makeWorkspace(),
  disposition = 'start'
} = {}) {
  const calls = [];
  let mutableIntent = structuredClone(intent);
  return {
    calls,
    async getIntent({ ownerId, intentId }) {
      calls.push(['getIntent', ownerId, intentId]);
      return ownerId === OWNER && intentId === mutableIntent.id
        ? structuredClone(mutableIntent)
        : null;
    },
    async getWorkspace({ ownerId, workspaceId }) {
      calls.push(['getWorkspace', ownerId, workspaceId]);
      return ownerId === OWNER && workspaceId === workspace.id
        ? structuredClone(workspace)
        : null;
    },
    async beginCommit({ ownerId, intentId }) {
      calls.push(['beginCommit', ownerId, intentId]);
      if (mutableIntent.state === 'COMMITTED')
        return {
          disposition: 'committed',
          intent: structuredClone(mutableIntent)
        };
      if (mutableIntent.state === 'COMMITTING')
        return {
          disposition: 'resume',
          intent: structuredClone(mutableIntent)
        };
      mutableIntent = { ...mutableIntent, state: 'COMMITTING' };
      return { disposition, intent: structuredClone(mutableIntent) };
    },
    async setCandidateCommit({ ownerId, intentId, commitSha }) {
      calls.push(['setCandidateCommit', ownerId, intentId, commitSha]);
      mutableIntent = {
        ...mutableIntent,
        candidateCommitSha: commitSha,
        state: 'COMMITTING'
      };
      return structuredClone(mutableIntent);
    },
    async completeCommit({ ownerId, intentId, commitSha, branch }) {
      calls.push(['completeCommit', ownerId, intentId, commitSha, branch]);
      mutableIntent = {
        ...mutableIntent,
        commitSha,
        branch,
        state: 'COMMITTED'
      };
      return structuredClone(mutableIntent);
    },
    async markStale({ ownerId, intentId, reason }) {
      calls.push(['markStale', ownerId, intentId, reason]);
      mutableIntent = { ...mutableIntent, state: 'STALE', staleReason: reason };
      return structuredClone(mutableIntent);
    }
  };
}

function makeGitHub({
  baseHead = BASE_HEAD,
  existingRef = null,
  createRefError = null
} = {}) {
  const calls = [];
  return {
    calls,
    async getBranchSnapshot(repoId, branch) {
      calls.push(['getBranchSnapshot', repoId, branch]);
      return { branch, headSha: baseHead, treeSha: BASE_TREE };
    },
    async getGitRef(repoId, branch, options) {
      calls.push(['getGitRef', repoId, branch, options]);
      return existingRef ? structuredClone(existingRef) : null;
    },
    async createGitBlob(repoId, text) {
      calls.push(['createGitBlob', repoId, text]);
      return { sha: CONTENT_BLOB };
    },
    async createGitTree(repoId, input) {
      calls.push(['createGitTree', repoId, structuredClone(input)]);
      return { sha: NEW_TREE };
    },
    async createGitCommit(repoId, input) {
      calls.push(['createGitCommit', repoId, structuredClone(input)]);
      return { sha: COMMIT_SHA };
    },
    async createGitBranchRef(repoId, input) {
      calls.push(['createGitBranchRef', repoId, structuredClone(input)]);
      if (createRefError) throw createRefError;
      return { ref: `refs/heads/${input.branch}`, sha: input.sha };
    }
  };
}

function minimalMenu() {
  return {
    async getReposListView() {
      return { text: 'repos', reply_markup: { inline_keyboard: [] } };
    },
    async renderByCallback(data) {
      return { text: `legacy:${data}`, reply_markup: { inline_keyboard: [] } };
    }
  };
}

test('workspace approval uses compact <=56 byte token and binds owner action risk repo and exact 8-char intent', async () => {
  let now = 1_700_000_000_000;
  const approvals = new ApprovalService({
    secret: 'workspace-secret',
    now: () => now,
    ttlMs: 120_000,
    replayStore: replayStore()
  });
  const token = await approvals.issue({
    pluginId: 'github',
    actionId: 'github.workspace.commit_branch',
    risk: 'WRITE',
    ownerId: OWNER,
    input: { repoId: REPO_ID, intentId: INTENT_ID }
  });
  assert.ok(new TextEncoder().encode(token).byteLength <= 56);
  assert.ok(new TextEncoder().encode(`approve:${token}`).byteLength <= 64);
  const payload = await approvals.consume(token, {
    ownerId: OWNER,
    pluginId: 'github',
    actionId: 'github.workspace.commit_branch',
    risk: 'WRITE'
  });
  assert.deepEqual(payload.input, { repoId: REPO_ID, intentId: INTENT_ID });
  await assert.rejects(
    () => approvals.consume(token, { ownerId: OWNER }),
    /already used/i
  );

  const second = await approvals.issue({
    pluginId: 'github',
    actionId: 'github.workspace.commit_branch',
    risk: 'WRITE',
    ownerId: OWNER,
    input: { repoId: REPO_ID, intentId: INTENT_ID }
  });
  now += 121_000;
  await assert.rejects(
    () => approvals.verify(second, { ownerId: OWNER }),
    /expired/i
  );
  await assert.rejects(
    () =>
      approvals.issue({
        pluginId: 'github',
        actionId: 'github.workspace.commit_branch',
        risk: 'WRITE',
        ownerId: OWNER,
        input: { repoId: REPO_ID, intentId: 'too-short' }
      }),
    /intent/i
  );
});

test('wscommit resolves to WRITE approval metadata before execution and performs zero GitHub or workspace calls pre-approval', async () => {
  const github = makeGitHub();
  const workspaces = makeWorkspaces();
  const plugin = createGitHubPlugin({
    github,
    menu: minimalMenu(),
    workspaces
  });
  const router = new PluginRouter({
    registry: new PluginRegistry([plugin]),
    policy: new ActionPolicy(),
    audit: new AuditLogger({ sink: () => {} })
  });
  const result = await router.dispatchCallback(
    `wscommit:${REPO_ID}:${INTENT_ID}`,
    { isOwner: true, ownerId: OWNER }
  );
  assert.equal(result.requiresApproval, true);
  assert.equal(result.actionId, 'github.workspace.commit_branch');
  assert.deepEqual(result.approval.input, {
    repoId: REPO_ID,
    intentId: INTENT_ID
  });
  assert.equal(result.approval.cancelCallback, `repo:${REPO_ID}`);
  assert.deepEqual(github.calls, []);
  assert.deepEqual(workspaces.calls, []);
});

test('approved orchestration fails closed on changed workspace material or stale base before any Git object creation', async () => {
  assert.equal(typeof workspaceModule.commitWorkspaceIntent, 'function');

  const changedWorkspaces = makeWorkspaces({
    workspace: makeWorkspace({
      currentIntentId: null,
      draftDigest: '9'.repeat(64)
    })
  });
  const changedGitHub = makeGitHub();
  await assert.rejects(
    () =>
      workspaceModule.commitWorkspaceIntent({
        github: changedGitHub,
        workspaces: changedWorkspaces,
        ownerId: OWNER,
        repoId: REPO_ID,
        intentId: INTENT_ID
      }),
    /intent|material|changed|stale/i
  );
  assert.equal(
    changedGitHub.calls.some((call) => call[0].startsWith('createGit')),
    false
  );

  const staleWorkspaces = makeWorkspaces();
  const staleGitHub = makeGitHub({ baseHead: '9'.repeat(40) });
  await assert.rejects(
    () =>
      workspaceModule.commitWorkspaceIntent({
        github: staleGitHub,
        workspaces: staleWorkspaces,
        ownerId: OWNER,
        repoId: REPO_ID,
        intentId: INTENT_ID
      }),
    /base|stale|changed/i
  );
  assert.equal(
    staleGitHub.calls.some((call) => call[0].startsWith('createGit')),
    false
  );
  assert.ok(staleWorkspaces.calls.some((call) => call[0] === 'markStale'));
});

test('approved orchestration rejects an unexpected existing target branch without creating Git objects', async () => {
  const workspaces = makeWorkspaces();
  const github = makeGitHub({
    existingRef: { branch: TARGET_BRANCH, sha: '8'.repeat(40) }
  });
  await assert.rejects(
    () =>
      workspaceModule.commitWorkspaceIntent({
        github,
        workspaces,
        ownerId: OWNER,
        repoId: REPO_ID,
        intentId: INTENT_ID
      }),
    /already exists|target branch|unexpected/i
  );
  assert.equal(
    github.calls.some((call) => call[0].startsWith('createGit')),
    false
  );
});

test('successful approved orchestration is blob -> tree -> commit -> durable candidate -> create ref -> durable COMMITTED', async () => {
  const workspaces = makeWorkspaces();
  const github = makeGitHub();
  const result = await workspaceModule.commitWorkspaceIntent({
    github,
    workspaces,
    ownerId: OWNER,
    repoId: REPO_ID,
    intentId: INTENT_ID
  });
  assert.deepEqual(result, {
    commitSha: COMMIT_SHA,
    branch: TARGET_BRANCH,
    idempotent: false
  });
  assert.deepEqual(
    github.calls.map((call) => call[0]),
    [
      'getBranchSnapshot',
      'getGitRef',
      'createGitBlob',
      'createGitTree',
      'createGitCommit',
      'createGitBranchRef'
    ]
  );
  const blobCall = github.calls.find((call) => call[0] === 'createGitBlob');
  assert.equal(blobCall[2], 'after\n');
  const treeCall = github.calls.find((call) => call[0] === 'createGitTree');
  assert.deepEqual(treeCall[2], {
    baseTreeSha: BASE_TREE,
    entries: [
      { path: 'src/app.js', mode: '100644', type: 'blob', sha: CONTENT_BLOB }
    ]
  });
  const commitCall = github.calls.find((call) => call[0] === 'createGitCommit');
  assert.deepEqual(commitCall[2], {
    message: 'edit app',
    treeSha: NEW_TREE,
    parentSha: BASE_HEAD,
    timestamp: TIMESTAMP
  });
  assert.ok(
    workspaces.calls.some(
      (call) => call[0] === 'setCandidateCommit' && call[3] === COMMIT_SHA
    )
  );
  assert.ok(
    workspaces.calls.some(
      (call) =>
        call[0] === 'completeCommit' &&
        call[3] === COMMIT_SHA &&
        call[4] === TARGET_BRANCH
    )
  );
});

test('COMMITTED and COMMITTING retries reconcile idempotently without a second provider write', async () => {
  const committedIntent = makeIntent({
    state: 'COMMITTED',
    commitSha: COMMIT_SHA,
    branch: TARGET_BRANCH
  });
  const committedWorkspaces = makeWorkspaces({ intent: committedIntent });
  const committedGitHub = makeGitHub();
  assert.deepEqual(
    await workspaceModule.commitWorkspaceIntent({
      github: committedGitHub,
      workspaces: committedWorkspaces,
      ownerId: OWNER,
      repoId: REPO_ID,
      intentId: INTENT_ID
    }),
    { commitSha: COMMIT_SHA, branch: TARGET_BRANCH, idempotent: true }
  );
  assert.deepEqual(committedGitHub.calls, []);

  const resumingIntent = makeIntent({
    state: 'COMMITTING',
    candidateCommitSha: COMMIT_SHA
  });
  const resumingWorkspaces = makeWorkspaces({ intent: resumingIntent });
  const resumingGitHub = makeGitHub({
    existingRef: { branch: TARGET_BRANCH, sha: COMMIT_SHA }
  });
  assert.deepEqual(
    await workspaceModule.commitWorkspaceIntent({
      github: resumingGitHub,
      workspaces: resumingWorkspaces,
      ownerId: OWNER,
      repoId: REPO_ID,
      intentId: INTENT_ID
    }),
    { commitSha: COMMIT_SHA, branch: TARGET_BRANCH, idempotent: true }
  );
  assert.deepEqual(
    resumingGitHub.calls.map((call) => call[0]),
    ['getGitRef']
  );
  assert.ok(
    resumingWorkspaces.calls.some((call) => call[0] === 'completeCommit')
  );
});

test('ambiguous create-ref error reconciles only the exact candidate SHA and rejects different or missing refs', async () => {
  const ambiguous = new Error(
    'GitHub create branch ref failed: 422 Reference already exists'
  );
  const sequenceGitHub = makeGitHub({ createRefError: ambiguous });
  let refReads = 0;
  sequenceGitHub.getGitRef = async (repoId, branch, options) => {
    sequenceGitHub.calls.push(['getGitRef', repoId, branch, options]);
    refReads += 1;
    return refReads === 1 ? null : { branch, sha: COMMIT_SHA };
  };
  const workspaces = makeWorkspaces();
  assert.deepEqual(
    await workspaceModule.commitWorkspaceIntent({
      github: sequenceGitHub,
      workspaces,
      ownerId: OWNER,
      repoId: REPO_ID,
      intentId: INTENT_ID
    }),
    { commitSha: COMMIT_SHA, branch: TARGET_BRANCH, idempotent: true }
  );

  for (const ref of [null, { branch: TARGET_BRANCH, sha: '7'.repeat(40) }]) {
    const github = makeGitHub({ createRefError: ambiguous });
    let reads = 0;
    github.getGitRef = async (repoId, branch, options) => {
      github.calls.push(['getGitRef', repoId, branch, options]);
      reads += 1;
      return reads === 1 ? null : ref;
    };
    await assert.rejects(
      () =>
        workspaceModule.commitWorkspaceIntent({
          github,
          workspaces: makeWorkspaces(),
          ownerId: OWNER,
          repoId: REPO_ID,
          intentId: INTENT_ID
        }),
      /422|reconcile|branch|candidate/i
    );
  }
});

test('router audit merges only allowlisted workspace metadata and never source draft text or signed token material', async () => {
  const events = [];
  const plugin = {
    manifest: {
      id: 'safe',
      name: 'safe',
      version: 1,
      commands: [],
      actions: { 'safe.write': { risk: 'WRITE' } }
    },
    resolveCallback() {
      return {
        actionId: 'safe.write',
        audit: {
          repoId: REPO_ID,
          workspaceId: WORKSPACE_ID,
          intentId: INTENT_ID,
          path: 'src/app.js',
          contentDigest: CONTENT_DIGEST,
          commitSha: COMMIT_SHA,
          draftText: 'DO NOT LOG THIS',
          token: 'approve:DO_NOT_LOG'
        },
        execute: async () => ({ text: 'ok' })
      };
    }
  };
  const router = new PluginRouter({
    registry: new PluginRegistry([plugin]),
    policy: new ActionPolicy(),
    audit: new AuditLogger({ sink: (event) => events.push(event) })
  });
  await router.dispatchCallback('x', { isOwner: true, approved: true });
  const serialized = JSON.stringify(events);
  assert.match(serialized, /src\/app\.js/);
  assert.match(serialized, new RegExp(INTENT_ID));
  assert.doesNotMatch(serialized, /DO NOT LOG THIS|DO_NOT_LOG|draftText|token/);
});
