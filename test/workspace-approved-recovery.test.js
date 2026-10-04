import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { buildApprovedActionFailedView } from '../src/core/callback-failure-view.js';

const OWNER = 42;
const WORKSPACE_ID = 'Ab12_cdEfG';
const REPO_ID = 123;
const INTENT_ID = 'Ab1_cdE2';

const payload = {
  pluginId: 'github',
  actionId: 'github.workspace.commit_branch',
  risk: 'WRITE',
  input: { repoId: REPO_ID, intentId: INTENT_ID }
};

const callbacksOf = view => view.reply_markup.inline_keyboard.flat().map(button => button.callback_data);

function workspaceStore() {
  return {
    async getIntent({ ownerId, intentId }) {
      assert.equal(ownerId, String(OWNER));
      assert.equal(intentId, INTENT_ID);
      return { id: INTENT_ID, workspaceId: WORKSPACE_ID, repoId: REPO_ID };
    }
  };
}

test('approved workspace provider failure offers fresh Ready, Draft, Project and Main recovery', async () => {
  const view = await buildApprovedActionFailedView({
    payload,
    error: new Error('GitHub create ref failed: 403 Resource not accessible by personal access token'),
    ownerId: OWNER,
    workspaces: workspaceStore()
  });

  const callbacks = callbacksOf(view);
  assert.ok(callbacks.includes(`wready:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`ws:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`repo:${REPO_ID}`));
  assert.ok(callbacks.includes('menu:main'));
});

test('bot uses durable intent context when approved workspace provider execution fails', async () => {
  const bot = new NexaDevBot({ TELEGRAM_WEBHOOK_SECRET: 'approved-recovery-test' });
  bot.approvals = { async consume() { return payload; } };
  bot.workspaceStore = workspaceStore();
  bot.router = { async dispatchCallback() { throw new Error('temporary GitHub provider failure'); } };

  const edits = [];
  bot.telegram = {
    async answerCallbackQuery() { return { ok: true }; },
    async editMessageText(chatId, messageId, text, replyMarkup) {
      edits.push({ chatId, messageId, text, replyMarkup });
      return { ok: true };
    }
  };

  const result = await bot.handleCallbackQuery({
    id: 'approve-recovery',
    data: 'approve:synthetic',
    from: { id: OWNER },
    message: { chat: { id: 7 }, message_id: 9 }
  });

  assert.equal(result.ok, false);
  assert.equal(result.approved, true);
  assert.equal(edits.length, 1);
  const callbacks = edits[0].replyMarkup.inline_keyboard.flat().map(button => button.callback_data);
  assert.ok(callbacks.includes(`wready:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`ws:${WORKSPACE_ID}`));
  assert.ok(callbacks.includes(`repo:${REPO_ID}`));
  assert.ok(callbacks.includes('menu:main'));
});
