import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';

const OWNER = 42;
const WORKSPACE_ID = 'Ab12_cdEfG';
const REPO_ID = 123;

function buttons(markup) {
  return markup?.inline_keyboard?.flat() || [];
}

function makeBot({
  routerError,
  workspace = { id: WORKSPACE_ID, repoId: REPO_ID }
} = {}) {
  const bot = new NexaDevBot({
    TELEGRAM_WEBHOOK_SECRET: 'recovery-test-secret'
  });
  bot.router = {
    async dispatchCallback() {
      throw routerError || new Error('temporary provider failure');
    }
  };
  bot.workspaceStore = {
    async getWorkspace({ ownerId, workspaceId }) {
      assert.equal(ownerId, String(OWNER));
      assert.equal(workspaceId, WORKSPACE_ID);
      return workspace;
    }
  };
  const edits = [];
  bot.telegram = {
    async answerCallbackQuery() {
      return { ok: true };
    },
    async editMessageText(chatId, messageId, text, replyMarkup) {
      edits.push({ chatId, messageId, text, replyMarkup });
      return { ok: true };
    }
  };
  return { bot, edits };
}

function query(data) {
  return {
    id: 'cb-recovery',
    data,
    from: { id: OWNER },
    message: { chat: { id: 7 }, message_id: 9 }
  };
}

test('ready without a commit message shows explicit validation and preserves workspace recovery actions', async () => {
  const { bot, edits } = makeBot({
    routerError: new Error('Commit message is required')
  });

  const result = await bot.handleCallbackQuery(query(`wready:${WORKSPACE_ID}`));

  assert.equal(result.ok, false);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /پیام Commit/);
  assert.doesNotMatch(edits[0].text, /دریافت اطلاعات از سرویس/);

  const callbacks = buttons(edits[0].replyMarkup).map(
    (button) => button.callback_data
  );
  assert.ok(callbacks.includes(`wmsg:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`ws:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`repo:${REPO_ID}`));
  assert.ok(callbacks.includes('menu:main'));
});

test('workspace callback failure keeps retry, draft, project and main-menu recovery routes', async () => {
  const { bot, edits } = makeBot({
    routerError: new Error('temporary provider failure')
  });

  const result = await bot.handleCallbackQuery(query(`wdiff:${WORKSPACE_ID}`));

  assert.equal(result.ok, false);
  assert.equal(edits.length, 1);
  const callbacks = buttons(edits[0].replyMarkup).map(
    (button) => button.callback_data
  );
  assert.ok(callbacks.includes(`wdiff:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`ws:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`repo:${REPO_ID}`));
  assert.ok(callbacks.includes('menu:main'));
});
