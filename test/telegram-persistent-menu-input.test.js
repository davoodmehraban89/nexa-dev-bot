import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { createWorkspaceController } from '../src/plugins/github/workspace.js';

const WORKSPACE_ID = 'W000000001';

function makeWorkspaceStore() {
  const workspace = {
    id: WORKSPACE_ID,
    repoId: 123,
    repoFullName: 'davood/demo',
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    baseTreeSha: 'b'.repeat(40),
    path: 'src/app.js',
    blobSha: 'c'.repeat(40),
    originalText: 'before\n',
    originalDigest: '0'.repeat(64),
    draftText: 'before\n',
    draftDigest: '0'.repeat(64),
    commitMessage: '',
    state: 'DRAFT'
  };
  let pending = null;
  return {
    workspace,
    async getWorkspace() { return structuredClone(workspace); },
    async setPendingInput({ workspaceId, mode }) {
      pending = { workspaceId, mode };
      return structuredClone(pending);
    },
    async getPendingInput() { return pending ? structuredClone(pending) : null; }
  };
}

test('/start installs a persistent bottom quick menu and still sends the inline main menu', async () => {
  const bot = new NexaDevBot({});
  const sent = [];
  bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
    return { ok: true, result: { message_id: 100 + sent.length } };
  };

  const result = await bot.handleMessage({ chat: { id: 7 }, from: { id: 42 }, text: '/start' });

  assert.equal(result.ok, true);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].replyMarkup.is_persistent, true);
  assert.equal(sent[0].replyMarkup.resize_keyboard, true);
  assert.deepEqual(sent[0].replyMarkup.keyboard.flat().map(button => button.text), [
    '🏠 منوی اصلی',
    '📁 پروژه‌ها',
    '📊 وضعیت',
    '🔧 ابزارها',
    '🔐 امنیت'
  ]);
  assert.ok(sent[1].replyMarkup.inline_keyboard);
});

test('persistent menu text has precedence over pending draft input', async () => {
  const bot = new NexaDevBot({});
  let pendingReads = 0;
  let workspaceDispatches = 0;
  const sent = [];

  bot.workspaceStore = {
    isConfigured: () => true,
    async getPendingInput() {
      pendingReads += 1;
      return { workspaceId: WORKSPACE_ID, mode: 'draft' };
    }
  };
  bot.router = {
    async dispatchMessage() {
      workspaceDispatches += 1;
      return { text: 'should not happen', reply_markup: { inline_keyboard: [] } };
    }
  };
  bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
    return { ok: true };
  };

  const result = await bot.handleMessage({ chat: { id: 7 }, from: { id: 42 }, text: '🏠 منوی اصلی' });

  assert.equal(result.ok, true);
  assert.equal(result.quickMenu, 'main');
  assert.equal(pendingReads, 0);
  assert.equal(workspaceDispatches, 0);
  assert.match(sent.at(-1).text, /Nexa Dev Bot/);
});

test('Paste text prepares a focused ForceReply code input instead of replacing the workspace message', async () => {
  const workspaces = makeWorkspaceStore();
  const controller = createWorkspaceController({ github: {}, workspaces });
  const route = controller.resolveCallback(`wtext:${WORKSPACE_ID}`, { ownerId: '42' });

  const prompt = await route.execute();

  assert.equal(prompt.delivery, 'send');
  assert.equal(prompt.reply_markup.force_reply, true);
  assert.equal(prompt.reply_markup.selective, true);
  assert.match(prompt.reply_markup.input_field_placeholder, /Paste|کد|متن/i);
  assert.equal(prompt.reply_markup.inline_keyboard, undefined);
  assert.deepEqual(await workspaces.getPendingInput(), { workspaceId: WORKSPACE_ID, mode: 'draft' });
});
