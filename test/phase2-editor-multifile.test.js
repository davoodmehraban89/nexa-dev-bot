import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWorkspaceEditorRequest } from '../src/workspace-editor.js';
import { createHmac } from 'node:crypto';
function initData(token = '123:TEST', userId = 42, authDate = 1800000000) {
  const p = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'q',
    user: JSON.stringify({ id: userId })
  });
  const s = [...p]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', key).update(s).digest('hex'));
  return p.toString();
}
const workspace = {
  id: 'W000000001',
  state: 'DRAFT',
  baseHeadSha: 'a'.repeat(40),
  path: 'README.md',
  draftText: 'one',
  files: [
    { path: 'README.md', draftText: 'one', originalText: 'zero' },
    { path: 'src/a.js', draftText: 'a', originalText: 'a' }
  ]
};
const context = (calls) => ({
  botToken: '123:TEST',
  ownerId: '42',
  now: () => 1800000000 * 1000,
  workspaces: {
    async getWorkspace() {
      return structuredClone(workspace);
    },
    async updateWorkspaceFileDraft(x) {
      calls.push(x);
      return {
        ...workspace,
        files: workspace.files.map((f) =>
          f.path === x.path ? { ...f, draftText: x.text } : f
        )
      };
    }
  }
});
const headers = { 'x-telegram-init-data': initData() };
test('editor GET exposes bounded file metadata and selects requested member path', async () => {
  const r = await handleWorkspaceEditorRequest(
    new Request(
      'https://x/workspace/api/editor?workspaceId=W000000001&path=src%2Fa.js',
      { headers }
    ),
    context([])
  );
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(
    b.workspace.files.map((f) => f.path),
    ['README.md', 'src/a.js']
  );
  assert.equal(b.workspace.path, 'src/a.js');
  assert.equal(b.workspace.draftText, 'a');
});
test('editor PUT updates selected member through path-scoped durable method', async () => {
  const calls = [];
  const r = await handleWorkspaceEditorRequest(
    new Request('https://x/workspace/api/editor', {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'W000000001',
        path: 'src/a.js',
        text: 'b'
      })
    }),
    context(calls)
  );
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'src/a.js');
  assert.equal(calls[0].text, 'b');
});
test('editor rejects path outside change set', async () => {
  const r = await handleWorkspaceEditorRequest(
    new Request('https://x/workspace/api/editor', {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'W000000001',
        path: 'evil.js',
        text: 'x'
      })
    }),
    context([])
  );
  assert.equal(r.status, 400);
  const b = await r.json();
  assert.match(b.error, /path|member|change set/i);
});
