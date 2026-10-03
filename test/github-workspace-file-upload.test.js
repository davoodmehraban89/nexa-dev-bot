import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';

const OWNER = '42';
const WORKSPACE_ID = 'W000000001';

function makeMenu() {
  return {
    async getReposListView() { return { text: 'repos', reply_markup: { inline_keyboard: [] } }; },
    async renderByCallback(data) { return { text: `legacy:${data}`, reply_markup: { inline_keyboard: [] } }; }
  };
}

function makeWorkspaces() {
  let pending = null;
  const workspace = {
    id: WORKSPACE_ID,
    repoId: 123,
    repoFullName: 'davood/demo',
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    baseTreeSha: 'b'.repeat(40),
    path: '.gitignore',
    blobSha: 'c'.repeat(40),
    originalText: 'node_modules/\n',
    draftText: 'node_modules/\n',
    commitMessage: '',
    state: 'DRAFT'
  };
  return {
    workspace,
    async getWorkspace({ ownerId, workspaceId }) {
      return ownerId === OWNER && workspaceId === WORKSPACE_ID ? structuredClone(workspace) : null;
    },
    async setPendingInput({ ownerId, workspaceId, mode }) {
      assert.equal(ownerId, OWNER);
      pending = { workspaceId, mode };
      return structuredClone(pending);
    },
    async getPendingInput({ ownerId }) {
      return ownerId === OWNER && pending ? structuredClone(pending) : null;
    },
    async consumePendingInput({ ownerId, workspaceId, mode }) {
      if (ownerId !== OWNER || !pending || pending.workspaceId !== workspaceId || pending.mode !== mode) return false;
      pending = null;
      return true;
    },
    async updateDraft({ ownerId, workspaceId, text, digest }) {
      assert.equal(ownerId, OWNER);
      assert.equal(workspaceId, WORKSPACE_ID);
      workspace.draftText = text;
      workspace.draftDigest = digest;
      workspace.state = 'DRAFT';
      return structuredClone(workspace);
    }
  };
}

function makePlugin() {
  const workspaces = makeWorkspaces();
  const github = {
    async getRepository(repoId) {
      return { id: String(repoId), name: 'demo', fullName: 'davood/demo', defaultBranch: 'main', archived: false };
    }
  };
  return { workspaces, plugin: createGitHubPlugin({ github, menu: makeMenu(), workspaces }) };
}

test('workspace exposes a primary file-upload input route with Telegram-safe callback data', async () => {
  const { workspaces, plugin } = makePlugin();
  const workspaceView = await plugin.resolveCallback(`ws:${WORKSPACE_ID}`, { ownerId: OWNER }).execute();
  const buttons = workspaceView.reply_markup.inline_keyboard.flat();
  const upload = buttons.find(button => button.callback_data === `wfile:${WORKSPACE_ID}`);
  assert.ok(upload);
  assert.match(upload.text, /file|فایل|upload|بارگذاری/i);
  assert.ok(new TextEncoder().encode(upload.callback_data).byteLength <= 64);

  const route = plugin.resolveCallback(upload.callback_data, { ownerId: OWNER });
  assert.equal(route.actionId, 'github.workspace.input.prepare');
  const prompt = await route.execute();
  assert.match(prompt.text, /12,?000|12000|UTF-?8|فایل/i);
  assert.deepEqual(await workspaces.getPendingInput({ ownerId: OWNER }), {
    workspaceId: WORKSPACE_ID,
    mode: 'draft_file'
  });
});

test('uploaded text file replaces only the local draft and preserves the repository target path', async () => {
  const { workspaces, plugin } = makePlugin();
  await plugin.resolveCallback(`wfile:${WORKSPACE_ID}`, { ownerId: OWNER }).execute();
  const pending = await workspaces.getPendingInput({ ownerId: OWNER });
  const route = plugin.resolveMessage({
    pending,
    file: { name: 'replacement.txt', text: 'node_modules/\n# smoke\n', byteLength: 22 }
  }, { ownerId: OWNER });
  assert.equal(route.actionId, 'github.workspace.input.apply');
  const view = await route.execute();
  assert.match(view.text, /Draft|ذخیره|فایل/i);
  assert.equal(workspaces.workspace.path, '.gitignore');
  assert.equal(workspaces.workspace.draftText, 'node_modules/\n# smoke\n');
  assert.equal(await workspaces.getPendingInput({ ownerId: OWNER }), null);
});

test('bot downloads a pending workspace document and dispatches its decoded file payload', async () => {
  const bot = new NexaDevBot({});
  const calls = [];
  bot.workspaceStore = {
    isConfigured: () => true,
    async getPendingInput({ ownerId }) {
      calls.push(['getPendingInput', ownerId]);
      return { workspaceId: WORKSPACE_ID, mode: 'draft_file' };
    }
  };
  bot.telegram = {
    async downloadTextFile(fileId, options) {
      calls.push(['downloadTextFile', fileId, options]);
      return { text: 'node_modules/\n# smoke\n', byteLength: 22, filePath: 'documents/replacement.txt' };
    },
    async sendMessage(chatId, text, replyMarkup) {
      calls.push(['sendMessage', chatId, text, replyMarkup]);
      return { ok: true };
    }
  };
  bot.router = {
    async dispatchMessage(payload, context) {
      calls.push(['dispatchMessage', structuredClone(payload), structuredClone(context)]);
      return { text: 'file accepted', reply_markup: { inline_keyboard: [] } };
    }
  };

  const result = await bot.handleMessage({
    chat: { id: 7 },
    from: { id: 42 },
    document: { file_id: 'FILE123', file_name: 'replacement.txt', file_size: 22 }
  });

  assert.equal(result.workspaceInput, true);
  assert.deepEqual(calls.find(call => call[0] === 'downloadTextFile'), ['downloadTextFile', 'FILE123', { maxBytes: 12000 }]);
  const dispatch = calls.find(call => call[0] === 'dispatchMessage');
  assert.deepEqual(dispatch[1].file, {
    name: 'replacement.txt',
    text: 'node_modules/\n# smoke\n',
    byteLength: 22
  });
  assert.deepEqual(dispatch[2], { isOwner: true, ownerId: OWNER });
});