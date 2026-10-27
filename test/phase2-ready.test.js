import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceController } from '../src/plugins/github/workspace.js';
const files = [
  {
    path: 'README.md',
    blobSha: 'c'.repeat(40),
    originalText: 'one',
    draftText: 'two',
    draftDigest: '1'.repeat(64)
  },
  {
    path: 'src/a.js',
    blobSha: 'd'.repeat(40),
    originalText: 'a',
    draftText: 'b',
    draftDigest: '2'.repeat(64)
  }
];
function setup(order = files) {
  let sealed;
  const workspace = {
    id: 'W000000001',
    repoId: 1,
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    baseTreeSha: 'b'.repeat(40),
    createdAt: 1000,
    commitMessage: 'msg',
    commitMessageDigest: '9'.repeat(64),
    files: order
  };
  const workspaces = {
    async getWorkspace() {
      return structuredClone(workspace);
    },
    async sealIntent({ intent }) {
      sealed = intent;
      return { id: 'I0000001', ...intent };
    }
  };
  return {
    c: createWorkspaceController({ github: {}, workspaces }),
    get: () => sealed
  };
}
test('Ready seals ordered descriptors for every changed file', async () => {
  const x = setup();
  await x.c.resolveCallback('wready:W000000001', { ownerId: '42' }).execute();
  const i = x.get();
  assert.deepEqual(
    i.files.map((f) => f.path),
    ['README.md', 'src/a.js']
  );
  assert.ok(i.files.every((f) => f.sourceBlobSha && f.contentDigest));
  assert.equal(i.path, undefined);
});
test('file order changes aggregate intent digest', async () => {
  const a = setup(files),
    b = setup([...files].reverse());
  await a.c.resolveCallback('wready:W000000001', { ownerId: '42' }).execute();
  await b.c.resolveCallback('wready:W000000001', { ownerId: '42' }).execute();
  assert.notEqual(a.get().intentDigest, b.get().intentDigest);
});
test('Ready rejects a change set with no changed files', async () => {
  const same = files.map((f) => ({ ...f, draftText: f.originalText }));
  const x = setup(same);
  await assert.rejects(
    () => x.c.resolveCallback('wready:W000000001', { ownerId: '42' }).execute(),
    /No draft change/i
  );
});
