import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableWorkspaceStoreClient } from '../src/core/workspace-store.js';
import { WorkspaceStore } from '../src/durable/workspace-store.js';

function makeState() {
  const data = new Map();
  let transactionTail = Promise.resolve();
  const api = {
    async get(key) {
      return structuredClone(data.get(key));
    },
    async put(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      return data.delete(key);
    }
  };
  return {
    data,
    storage: {
      ...api,
      transaction(fn) {
        const result = transactionTail.then(() => fn(api));
        transactionTail = result.catch(() => {});
        return result;
      },
      async setAlarm() {}
    }
  };
}

function fixture() {
  const states = new Map();
  const namespace = {
    idFromName: String,
    get(id) {
      if (!states.has(id)) states.set(id, makeState());
      const store = new WorkspaceStore(states.get(id));
      return { fetch: (request) => store.fetch(request) };
    }
  };
  const client = new DurableWorkspaceStoreClient({
    namespace,
    now: () => 1000
  });
  return { client, states };
}

const initial = {
  ownerId: 'A',
  repoId: 123,
  repoFullName: 'owner/repo',
  baseBranch: 'main',
  baseHeadSha: 'a'.repeat(40),
  baseTreeSha: 'b'.repeat(40),
  path: 'a.txt',
  blobSha: 'c'.repeat(40),
  originalText: 'before\n',
  originalDigest: 'd'.repeat(64)
};

const edit = (workspaceId, overrides = {}) => ({
  ownerId: 'A',
  workspaceId,
  path: 'a.txt',
  text: 'after\n',
  digest: 'e'.repeat(64),
  expectedRevision: 0,
  ...overrides
});

const isConflict = (error) => {
  assert.equal(error.status, 409);
  assert.equal(error.code, 'REVISION_CONFLICT');
  assert.equal(error.message.includes('PRIVATE_DRAFT_SENTINEL'), false);
  return true;
};

test('per-file revisions start at zero and successful conditional edits advance them', async () => {
  const { client } = fixture();
  let workspace = await client.createWorkspace(initial);
  assert.equal(workspace.files[0].revision, 0);
  workspace = await client.updateWorkspaceFileDraft(edit(workspace.id));
  assert.equal(workspace.files[0].revision, 1);
  assert.equal(workspace.files[0].draftText, 'after\n');
  workspace = await client.updateWorkspaceFileDraft(
    edit(workspace.id, {
      expectedRevision: 1,
      text: 'next\n',
      digest: 'f'.repeat(64)
    })
  );
  assert.equal(workspace.files[0].revision, 2);
});

test('stale revisions return a typed conflict without changing workspace or READY intent', async () => {
  const { client, states } = fixture();
  const workspace = await client.createWorkspace(initial);
  await client.updateWorkspaceFileDraft(edit(workspace.id));
  await client.sealIntent({
    ownerId: 'A',
    workspaceId: workspace.id,
    intent: { intentDigest: '1'.repeat(64) }
  });
  await client.setPendingInput({
    ownerId: 'A',
    workspaceId: workspace.id,
    mode: 'draft_file'
  });
  const before = structuredClone(states.get('A').data);
  await assert.rejects(
    client.updateWorkspaceFileDraft(
      edit(workspace.id, {
        text: 'PRIVATE_DRAFT_SENTINEL',
        digest: 'f'.repeat(64)
      })
    ),
    isConflict
  );
  assert.deepEqual(states.get('A').data, before);
});

test('a same-file concurrent If-Match update has exactly one winner', async () => {
  const { client } = fixture();
  const workspace = await client.createWorkspace(initial);
  const outcomes = await Promise.allSettled([
    client.updateWorkspaceFileDraft(edit(workspace.id)),
    client.updateWorkspaceFileDraft(
      edit(workspace.id, { text: 'second\n', digest: 'f'.repeat(64) })
    )
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((r) => r.status === 'rejected');
  isConflict(rejected.reason);
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.files[0].revision, 1);
  assert.equal(
    stored.files[0].draftText,
    outcomes.find((r) => r.status === 'fulfilled').value.files[0].draftText
  );
});

test('concurrent edits of different files preserve both edits and independent revisions', async () => {
  const { client } = fixture();
  let workspace = await client.createWorkspace(initial);
  workspace = await client.upsertWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    file: { ...initial, path: 'b.txt' }
  });
  assert.equal(workspace.files[1].revision, 0);
  await Promise.all([
    client.updateWorkspaceFileDraft(edit(workspace.id)),
    client.updateWorkspaceFileDraft(
      edit(workspace.id, {
        path: 'b.txt',
        text: 'second\n',
        digest: 'f'.repeat(64)
      })
    )
  ]);
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.deepEqual(
    stored.files.map(({ path, draftText, revision }) => ({
      path,
      draftText,
      revision
    })),
    [
      { path: 'a.txt', draftText: 'after\n', revision: 1 },
      { path: 'b.txt', draftText: 'second\n', revision: 1 }
    ]
  );
});

test('a concurrent commit-message write cannot restore an earlier file draft', async () => {
  const { client } = fixture();
  const workspace = await client.createWorkspace(initial);
  await Promise.all([
    client.updateWorkspaceFileDraft(edit(workspace.id)),
    client.setCommitMessage({
      ownerId: 'A',
      workspaceId: workspace.id,
      message: 'Update file',
      digest: '1'.repeat(64)
    })
  ]);
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.files[0].draftText, 'after\n');
  assert.equal(stored.files[0].revision, 1);
  assert.equal(stored.commitMessage, 'Update file');
});

test('concurrent intent sealing cannot restore an earlier file draft', async () => {
  const { client } = fixture();
  const workspace = await client.createWorkspace(initial);
  await Promise.all([
    client.updateWorkspaceFileDraft(edit(workspace.id)),
    client.sealIntent({
      ownerId: 'A',
      workspaceId: workspace.id,
      intent: { intentDigest: '1'.repeat(64) }
    })
  ]);
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.files[0].draftText, 'after\n');
  assert.equal(stored.files[0].revision, 1);
});

test('legacy edits without expectedRevision still invalidate stale conditional edits', async () => {
  const { client } = fixture();
  let workspace = await client.createWorkspace(initial);
  workspace = await client.updateWorkspaceFileDraft(
    edit(workspace.id, { expectedRevision: undefined })
  );
  assert.equal(workspace.files[0].revision, 1);
  await assert.rejects(
    client.updateWorkspaceFileDraft(edit(workspace.id)),
    isConflict
  );
  workspace = await client.updateDraft({
    ownerId: 'A',
    workspaceId: workspace.id,
    text: 'legacy\n',
    digest: 'f'.repeat(64)
  });
  assert.equal(workspace.files[0].revision, 2);
  await assert.rejects(
    client.updateWorkspaceFileDraft(
      edit(workspace.id, { expectedRevision: 1 })
    ),
    isConflict
  );
});

test('identical draft calls advance revisions while preserving an identical READY intent', async () => {
  const { client } = fixture();
  const workspace = await client.createWorkspace(initial);
  const intent = await client.sealIntent({
    ownerId: 'A',
    workspaceId: workspace.id,
    intent: { intentDigest: '1'.repeat(64) }
  });
  let updated = await client.updateWorkspaceFileDraft(
    edit(workspace.id, {
      text: initial.originalText,
      digest: initial.originalDigest
    })
  );
  assert.equal(updated.files[0].revision, 1);
  assert.equal(updated.currentIntentId, intent.id);
  assert.equal(updated.state, 'READY');
  updated = await client.updateDraft({
    ownerId: 'A',
    workspaceId: workspace.id,
    text: initial.originalText,
    digest: initial.originalDigest
  });
  assert.equal(updated.files[0].revision, 2);
  assert.equal(updated.currentIntentId, intent.id);
  updated = await client.updateWorkspaceFileDraft(
    edit(workspace.id, { expectedRevision: 2 })
  );
  assert.equal(updated.currentIntentId, null);
  assert.equal(updated.state, 'DRAFT');
});

test('pre-revision multi-file and legacy records read as zero and accept the first conditional write', async () => {
  for (const legacy of [false, true]) {
    const { client, states } = fixture();
    const workspace = await client.createWorkspace(initial);
    const stored = structuredClone(
      states.get('A').data.get(`ws:${workspace.id}`)
    );
    delete stored.files[0].revision;
    if (legacy) delete stored.files;
    states.get('A').data.set(`ws:${workspace.id}`, stored);
    const loaded = await client.getWorkspace({
      ownerId: 'A',
      workspaceId: workspace.id
    });
    assert.equal(loaded.files[0].revision, 0);
    const updated = await client.updateWorkspaceFileDraft(edit(workspace.id));
    assert.equal(updated.files[0].revision, 1);
  }
});

test('removing and readding a path cannot revive an old revision', async () => {
  const { client } = fixture();
  let workspace = await client.createWorkspace(initial);
  workspace = await client.upsertWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    file: { ...initial, path: 'b.txt' }
  });
  await client.updateWorkspaceFileDraft(edit(workspace.id));
  await client.removeWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    path: 'a.txt'
  });
  workspace = await client.upsertWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    file: initial
  });
  assert.equal(workspace.files[0].revision, 0);
  assert.equal(workspace.files[1].revision, 2);
  for (const expectedRevision of [0, 1]) {
    await assert.rejects(
      client.updateWorkspaceFileDraft(edit(workspace.id, { expectedRevision })),
      isConflict
    );
  }
  workspace = await client.updateWorkspaceFileDraft(
    edit(workspace.id, { expectedRevision: 2 })
  );
  assert.equal(workspace.files[1].revision, 3);
});

test('foreign-owner conditional updates have no effect on the owner workspace', async () => {
  const { client, states } = fixture();
  const workspace = await client.createWorkspace(initial);
  const before = structuredClone(states.get('A').data);
  await assert.rejects(
    client.updateWorkspaceFileDraft(edit(workspace.id, { ownerId: 'B' })),
    /not found or expired/i
  );
  assert.deepEqual(states.get('A').data, before);
  assert.equal(
    await client.getWorkspace({ ownerId: 'B', workspaceId: workspace.id }),
    null
  );
});

test('invalid expected revisions cannot disable optimistic concurrency', async () => {
  const { client, states } = fixture();
  const workspace = await client.createWorkspace(initial);
  const before = structuredClone(states.get('A').data);
  for (const expectedRevision of [
    null,
    '',
    '0',
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    await assert.rejects(
      client.updateWorkspaceFileDraft(edit(workspace.id, { expectedRevision })),
      /revision.*invalid/i
    );
  }
  assert.deepEqual(states.get('A').data, before);
});

const materialMutations = (client, workspaceId) => [
  () => client.updateWorkspaceFileDraft(edit(workspaceId)),
  () =>
    client.updateDraft({
      ownerId: 'A',
      workspaceId,
      text: 'legacy\n',
      digest: 'f'.repeat(64)
    }),
  () =>
    client.upsertWorkspaceFile({
      ownerId: 'A',
      workspaceId,
      file: { ...initial, path: 'c.txt' }
    }),
  () =>
    client.removeWorkspaceFile({ ownerId: 'A', workspaceId, path: 'b.txt' }),
  () =>
    client.setCommitMessage({
      ownerId: 'A',
      workspaceId,
      message: 'Late message',
      digest: 'f'.repeat(64)
    }),
  () =>
    client.sealIntent({
      ownerId: 'A',
      workspaceId,
      intent: { intentDigest: 'f'.repeat(64) }
    })
];

test('writes queued behind beginCommit cannot reset an in-flight workspace', async () => {
  const { client, states } = fixture();
  let workspace = await client.createWorkspace(initial);
  workspace = await client.upsertWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    file: { ...initial, path: 'b.txt' }
  });
  const intent = await client.sealIntent({
    ownerId: 'A',
    workspaceId: workspace.id,
    intent: { intentDigest: '1'.repeat(64) }
  });
  const operations = materialMutations(client, workspace.id);
  const [started, ...outcomes] = await Promise.allSettled([
    client.beginCommit({ ownerId: 'A', intentId: intent.id }),
    ...operations.map((operation) => operation())
  ]);
  assert.equal(started.status, 'fulfilled');
  assert.equal(started.value.disposition, 'start');
  for (const outcome of outcomes) {
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason.status, 409);
    assert.equal(outcome.reason.code, 'WORKSPACE_NOT_EDITABLE');
  }
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.files[0].draftText, 'before\n');
  assert.equal(stored.files[0].revision, 0);
  assert.equal(stored.files.length, 2);
  assert.equal(stored.commitMessage, '');
  assert.equal(stored.currentIntentId, intent.id);
  assert.equal(
    states.get('A').data.get(`intent:${intent.id}`).state,
    'COMMITTING'
  );
});

test('committed workspace material and message cannot be changed by a delayed write', async () => {
  const { client, states } = fixture();
  let workspace = await client.createWorkspace(initial);
  workspace = await client.upsertWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    file: { ...initial, path: 'b.txt' }
  });
  const intent = await client.sealIntent({
    ownerId: 'A',
    workspaceId: workspace.id,
    intent: { intentDigest: '1'.repeat(64) }
  });
  await client.beginCommit({ ownerId: 'A', intentId: intent.id });
  await client.completeCommit({
    ownerId: 'A',
    intentId: intent.id,
    commitSha: 'e'.repeat(40),
    branch: `nexa/edit-${workspace.id}`
  });
  const before = structuredClone(states.get('A').data);
  for (const operation of materialMutations(client, workspace.id)) {
    await assert.rejects(operation(), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'WORKSPACE_NOT_EDITABLE');
      return true;
    });
  }
  assert.deepEqual(states.get('A').data, before);
});

test('concurrent file additions cannot exceed the eight-file workspace limit', async () => {
  const { client } = fixture();
  let workspace = await client.createWorkspace(initial);
  for (let index = 1; index < 7; index++) {
    workspace = await client.upsertWorkspaceFile({
      ownerId: 'A',
      workspaceId: workspace.id,
      file: { ...initial, path: `${index}.txt` }
    });
  }
  const outcomes = await Promise.allSettled(
    ['last.txt', 'excess.txt'].map((path) =>
      client.upsertWorkspaceFile({
        ownerId: 'A',
        workspaceId: workspace.id,
        file: { ...initial, path }
      })
    )
  );
  assert.equal(
    outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
    1
  );
  const failure = outcomes.find((outcome) => outcome.status === 'rejected');
  assert.equal(failure.reason.status, 422);
  assert.equal(failure.reason.code, 'WORKSPACE_LIMIT_EXCEEDED');
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.files.length, 8);
});

test('concurrent different-file edits enforce the UTF-8 aggregate boundary atomically', async () => {
  const { client } = fixture();
  const large = '😀'.repeat(10000);
  let workspace = await client.createWorkspace({
    ...initial,
    originalText: large
  });
  for (const path of ['b.txt', 'c.txt']) {
    workspace = await client.upsertWorkspaceFile({
      ownerId: 'A',
      workspaceId: workspace.id,
      file: { ...initial, path, originalText: large }
    });
  }
  const outcomes = await Promise.allSettled(
    ['a.txt', 'b.txt'].map((path) =>
      client.updateWorkspaceFileDraft(
        edit(workspace.id, { path, text: large + 'x'.repeat(6000) })
      )
    )
  );
  assert.equal(
    outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
    1
  );
  const failure = outcomes.find((outcome) => outcome.status === 'rejected');
  assert.equal(failure.reason.status, 422);
  assert.equal(failure.reason.code, 'WORKSPACE_LIMIT_EXCEEDED');
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(
    stored.files.reduce(
      (total, file) =>
        total + new TextEncoder().encode(file.draftText).byteLength,
      0
    ),
    126000
  );
  assert.deepEqual(stored.files.map((file) => file.revision).sort(), [0, 0, 1]);
});

test('workspace aggregate policy retains original text when an edited draft shrinks', async () => {
  const { client, states } = fixture();
  const large = '😀'.repeat(15000);
  let workspace = await client.createWorkspace({
    ...initial,
    originalText: large
  });
  workspace = await client.upsertWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    file: { ...initial, path: 'b.txt', originalText: large }
  });
  await client.updateWorkspaceFileDraft(edit(workspace.id, { text: '' }));
  await client.updateWorkspaceFileDraft(
    edit(workspace.id, { path: 'b.txt', text: '' })
  );
  const before = structuredClone(states.get('A').data);
  await assert.rejects(
    client.upsertWorkspaceFile({
      ownerId: 'A',
      workspaceId: workspace.id,
      file: { ...initial, path: 'c.txt', originalText: 'x'.repeat(11073) }
    }),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.code, 'WORKSPACE_LIMIT_EXCEEDED');
      return true;
    }
  );
  assert.deepEqual(states.get('A').data, before);
});

const reviewOf = (workspace) => ({
  baseHeadSha: workspace.baseHeadSha,
  files: workspace.files.map(({ path, revision }) => ({ path, revision }))
});

const reviewedIntent = (workspaceId, overrides = {}) => ({
  workspaceId,
  repoId: 123,
  baseBranch: 'main',
  baseHeadSha: 'a'.repeat(40),
  baseTreeSha: 'b'.repeat(40),
  files: [
    {
      path: 'a.txt',
      sourceBlobSha: 'c'.repeat(40),
      contentDigest: 'd'.repeat(64)
    }
  ],
  commitMessageDigest: '1'.repeat(64),
  intentDigest: '2'.repeat(64),
  ...overrides
});

test('a message change queued before sealing rejects its displayed digest atomically', async () => {
  const { client, states } = fixture();
  const workspace = await client.createWorkspace(initial);
  await client.setCommitMessage({
    ownerId: 'A',
    workspaceId: workspace.id,
    message: 'Reviewed message',
    digest: '1'.repeat(64)
  });
  const [saved, sealed] = await Promise.allSettled([
    client.setCommitMessage({
      ownerId: 'A',
      workspaceId: workspace.id,
      message: 'Unreviewed message',
      digest: '2'.repeat(64)
    }),
    client.sealIntent({
      ownerId: 'A',
      workspaceId: workspace.id,
      intent: reviewedIntent(workspace.id),
      expectedReview: {
        ...reviewOf(workspace),
        commitMessageDigest: '1'.repeat(64)
      }
    })
  ]);
  assert.equal(saved.status, 'fulfilled');
  assert.equal(sealed.status, 'rejected');
  isConflict(sealed.reason);
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.commitMessage, 'Unreviewed message');
  assert.equal(stored.currentIntentId, null);
  assert.equal(stored.state, 'DRAFT');
  assert.equal(
    [...states.get('A').data.keys()].some((key) => key.startsWith('intent:')),
    false
  );
});

test('sealing accepts a matching displayed message digest and preserves legacy review callers', async () => {
  const { client } = fixture();
  const workspace = await client.createWorkspace(initial);
  await client.setCommitMessage({
    ownerId: 'A',
    workspaceId: workspace.id,
    message: 'Reviewed message',
    digest: '1'.repeat(64)
  });
  const sealed = await client.sealIntent({
    ownerId: 'A',
    workspaceId: workspace.id,
    intent: reviewedIntent(workspace.id),
    expectedReview: {
      ...reviewOf(workspace),
      commitMessageDigest: '1'.repeat(64)
    }
  });
  const repeated = await client.sealIntent({
    ownerId: 'A',
    workspaceId: workspace.id,
    intent: { intentDigest: '2'.repeat(64) },
    expectedReview: reviewOf(workspace)
  });
  assert.equal(sealed.state, 'READY');
  assert.equal(repeated.id, sealed.id);
});

test('a message-bound review seals only proposed material matching the current workspace', async () => {
  const { client, states } = fixture();
  const workspace = await client.createWorkspace(initial);
  await client.setCommitMessage({
    ownerId: 'A',
    workspaceId: workspace.id,
    message: 'Reviewed message',
    digest: '1'.repeat(64)
  });
  const before = structuredClone(states.get('A').data);
  for (const overrides of [
    { workspaceId: 'OTHER12345' },
    { repoId: 999 },
    { baseBranch: 'other' },
    { baseHeadSha: 'f'.repeat(40) },
    { baseTreeSha: 'f'.repeat(40) },
    { commitMessageDigest: 'f'.repeat(64) },
    { files: [] },
    {
      files: [
        {
          path: 'b.txt',
          sourceBlobSha: 'c'.repeat(40),
          contentDigest: 'd'.repeat(64)
        }
      ]
    },
    {
      files: [
        {
          path: 'a.txt',
          sourceBlobSha: 'f'.repeat(40),
          contentDigest: 'd'.repeat(64)
        }
      ]
    },
    {
      files: [
        {
          path: 'a.txt',
          sourceBlobSha: 'c'.repeat(40),
          contentDigest: 'f'.repeat(64)
        }
      ]
    }
  ]) {
    await assert.rejects(
      client.sealIntent({
        ownerId: 'A',
        workspaceId: workspace.id,
        intent: reviewedIntent(workspace.id, overrides),
        expectedReview: {
          ...reviewOf(workspace),
          commitMessageDigest: '1'.repeat(64)
        }
      }),
      isConflict
    );
    assert.deepEqual(states.get('A').data, before);
  }
});

test('sealing a stale review cannot replace the currently edited workspace intent', async () => {
  const { client, states } = fixture();
  const workspace = await client.createWorkspace(initial);
  const expectedReview = reviewOf(workspace);
  await client.updateWorkspaceFileDraft(edit(workspace.id));
  const before = structuredClone(states.get('A').data);
  await assert.rejects(
    client.sealIntent({
      ownerId: 'A',
      workspaceId: workspace.id,
      intent: { intentDigest: '1'.repeat(64) },
      expectedReview
    }),
    isConflict
  );
  assert.deepEqual(states.get('A').data, before);
});

test('review sealing compares the exact file set and base head rather than only matching revisions', async () => {
  const { client, states } = fixture();
  let workspace = await client.createWorkspace(initial);
  workspace = await client.upsertWorkspaceFile({
    ownerId: 'A',
    workspaceId: workspace.id,
    file: { ...initial, path: 'b.txt' }
  });
  const before = structuredClone(states.get('A').data);
  for (const expectedReview of [
    { ...reviewOf(workspace), baseHeadSha: 'f'.repeat(40) },
    { ...reviewOf(workspace), files: [{ path: 'a.txt', revision: 0 }] },
    {
      ...reviewOf(workspace),
      files: [
        { path: 'a.txt', revision: 0 },
        { path: 'c.txt', revision: 0 }
      ]
    }
  ]) {
    await assert.rejects(
      client.sealIntent({
        ownerId: 'A',
        workspaceId: workspace.id,
        intent: { intentDigest: '1'.repeat(64) },
        expectedReview
      }),
      isConflict
    );
    assert.deepEqual(states.get('A').data, before);
  }
});

test('an edit queued before review sealing wins and rejects the stale review atomically', async () => {
  const { client } = fixture();
  const workspace = await client.createWorkspace(initial);
  const [saved, sealed] = await Promise.allSettled([
    client.updateWorkspaceFileDraft(edit(workspace.id)),
    client.sealIntent({
      ownerId: 'A',
      workspaceId: workspace.id,
      intent: { intentDigest: '1'.repeat(64) },
      expectedReview: reviewOf(workspace)
    })
  ]);
  assert.equal(saved.status, 'fulfilled');
  assert.equal(sealed.status, 'rejected');
  isConflict(sealed.reason);
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.files[0].revision, 1);
  assert.equal(stored.currentIntentId, null);
  assert.equal(stored.state, 'DRAFT');
});

test('an edit queued after a matching review seal invalidates its READY intent', async () => {
  const { client } = fixture();
  const workspace = await client.createWorkspace(initial);
  const [sealed] = await Promise.all([
    client.sealIntent({
      ownerId: 'A',
      workspaceId: workspace.id,
      intent: { intentDigest: '1'.repeat(64) },
      expectedReview: reviewOf(workspace)
    }),
    client.updateWorkspaceFileDraft(edit(workspace.id))
  ]);
  assert.equal(sealed.state, 'READY');
  const stored = await client.getWorkspace({
    ownerId: 'A',
    workspaceId: workspace.id
  });
  assert.equal(stored.files[0].revision, 1);
  assert.equal(stored.currentIntentId, null);
  assert.equal(stored.state, 'DRAFT');
});
