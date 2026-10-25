import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableWorkspaceStoreClient } from '../src/core/workspace-store.js';
import { WorkspaceStore } from '../src/durable/workspace-store.js';
import { createWorkspaceController } from '../src/plugins/github/workspace.js';

const OWNER = '42';
const EDITOR_URL = 'https://example.com/workspace/editor';
const ORIGINAL = 'node_modules/\n';
const SENTINEL = 'SOURCE_MUST_STAY_OUT_OF_TELEGRAM_WORKFLOW';

async function fixture(editorUrl = EDITOR_URL) {
  const states = new Map();
  const workspaces = new DurableWorkspaceStoreClient({
    now: () => 1000,
    namespace: {
      idFromName: (name) => String(name),
      get(id) {
        if (!states.has(id)) {
          const data = new Map();
          const storage = {
            async get(key) {
              return data.get(key);
            },
            async put(key, value) {
              data.set(key, structuredClone(value));
            },
            async delete(key) {
              return data.delete(key);
            },
            async list() {
              return new Map(data);
            },
            async transaction(fn) {
              return fn(storage);
            },
            async setAlarm() {}
          };
          states.set(id, new WorkspaceStore({ storage }));
        }
        return { fetch: (request) => states.get(id).fetch(request) };
      }
    }
  });
  const workspace = await workspaces.createWorkspace({
    ownerId: OWNER,
    repoId: 123,
    repoFullName: 'davood/demo',
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    baseTreeSha: 'b'.repeat(40),
    path: '.gitignore',
    blobSha: 'c'.repeat(40),
    originalText: ORIGINAL,
    originalDigest: 'd'.repeat(64)
  });
  return {
    workspace,
    workspaces,
    controller: createWorkspaceController({ github: {}, workspaces, editorUrl })
  };
}

function buttons(view) {
  return view.reply_markup.inline_keyboard.flat();
}

function assertEditor(view, workspaceId) {
  const editor = buttons(view).find((button) => button.web_app);
  assert.ok(editor, 'the rejected source-input route must offer the Mini App');
  assert.equal(editor.web_app.url, `${EDITOR_URL}?workspaceId=${workspaceId}`);
  assert.doesNotMatch(JSON.stringify(view), new RegExp(SENTINEL));
}

test('workspace offers only Mini App editing even when the editor is unavailable', async () => {
  for (const editorUrl of [EDITOR_URL, '', 'http://example.com/editor']) {
    const { controller, workspace, workspaces } = await fixture(editorUrl);
    await workspaces.upsertWorkspaceFile({
      ownerId: OWNER,
      workspaceId: workspace.id,
      file: {
        path: 'README.md',
        blobSha: 'e'.repeat(40),
        originalText: '# Demo\n',
        draftText: '# Demo\n',
        originalDigest: 'f'.repeat(64),
        draftDigest: 'f'.repeat(64)
      }
    });
    const view = await controller
      .resolveCallback(`ws:${workspace.id}`, { ownerId: OWNER })
      .execute();
    assert.ok(
      view.reply_markup.inline_keyboard.every((row) => row.length > 0),
      'the multi-file workspace must send usable keyboard rows'
    );
    assert.equal(
      buttons(view).some((button) =>
        /^w(?:text|file):/.test(button.callback_data || '')
      ),
      false,
      `Telegram source input must remain disabled for ${editorUrl || 'missing editor'}`
    );
    if (editorUrl === EDITOR_URL)
      assert.deepEqual(
        buttons(view)
          .filter((button) => button.web_app)
          .map((button) => button.web_app.url),
        [
          `${EDITOR_URL}?workspaceId=${workspace.id}&path=.gitignore`,
          `${EDITOR_URL}?workspaceId=${workspace.id}&path=README.md`
        ]
      );
    else {
      assert.equal(
        buttons(view).some((button) => button.web_app),
        false
      );
      assert.match(view.text, /Editor.*دسترس|Mini App.*دسترس/);
    }
  }
});

for (const [prefix, mode] of [
  ['wtext', 'draft'],
  ['wfile', 'draft_file']
]) {
  test(`stale ${prefix} callback clears its old pending source input and redirects to Mini App`, async () => {
    const { controller, workspace, workspaces } = await fixture();
    await workspaces.setPendingInput({
      ownerId: OWNER,
      workspaceId: workspace.id,
      mode
    });
    const view = await controller
      .resolveCallback(`${prefix}:${workspace.id}`, { ownerId: OWNER })
      .execute();
    assert.equal(await workspaces.getPendingInput({ ownerId: OWNER }), null);
    assertEditor(view, workspace.id);
    const saved = await workspaces.getWorkspace({
      ownerId: OWNER,
      workspaceId: workspace.id
    });
    assert.equal(saved.draftText, ORIGINAL);
  });

  test(`stale ${prefix} callback preserves an active commit-message input`, async () => {
    const { controller, workspace, workspaces } = await fixture();
    await workspaces.setPendingInput({
      ownerId: OWNER,
      workspaceId: workspace.id,
      mode: 'commit_message'
    });
    const view = await controller
      .resolveCallback(`${prefix}:${workspace.id}`, { ownerId: OWNER })
      .execute();
    assert.deepEqual(await workspaces.getPendingInput({ ownerId: OWNER }), {
      workspaceId: workspace.id,
      mode: 'commit_message'
    });
    assertEditor(view, workspace.id);
  });

  test(`pending ${mode} is consumed without accessing or saving Telegram source fields`, async () => {
    const { controller, workspace, workspaces } = await fixture();
    await workspaces.setPendingInput({
      ownerId: OWNER,
      workspaceId: workspace.id,
      mode
    });
    const pending = await workspaces.getPendingInput({ ownerId: OWNER });
    let sourceReads = 0;
    const payload = {
      pending,
      get text() {
        sourceReads += 1;
        return SENTINEL;
      },
      get file() {
        sourceReads += 1;
        return { name: 'replacement.txt', text: SENTINEL, byteLength: 100 };
      }
    };
    const view = await controller
      .resolveMessage(payload, { ownerId: OWNER })
      .execute();
    assert.equal(
      sourceReads,
      0,
      'disabled source input must not inspect Telegram body fields'
    );
    assert.equal(await workspaces.getPendingInput({ ownerId: OWNER }), null);
    const saved = await workspaces.getWorkspace({
      ownerId: OWNER,
      workspaceId: workspace.id
    });
    assert.equal(saved.draftText, ORIGINAL);
    assert.equal(saved.files[0].draftText, ORIGINAL);
    assertEditor(view, workspace.id);
  });

  test(`pending ${mode} redirects with metadata alone and cannot be replayed`, async () => {
    const { controller, workspace, workspaces } = await fixture();
    await workspaces.setPendingInput({
      ownerId: OWNER,
      workspaceId: workspace.id,
      mode
    });
    const pending = await workspaces.getPendingInput({ ownerId: OWNER });
    const route = controller.resolveMessage({ pending }, { ownerId: OWNER });
    const view = await route.execute();
    assertEditor(view, workspace.id);
    assert.equal(await workspaces.getPendingInput({ ownerId: OWNER }), null);
    await assert.rejects(() => route.execute(), /consumed|expired/i);
    const saved = await workspaces.getWorkspace({
      ownerId: OWNER,
      workspaceId: workspace.id
    });
    assert.equal(saved.draftText, ORIGINAL);
  });
}
