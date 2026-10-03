import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { ApprovalService } from '../src/core/approval.js';

const OWNER = 42;
const REPO_ID = 123;
const INTENT_ID = 'Ab12_cdE';

function oneShotReplayStore() {
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

function buttons(markup) {
  return markup?.inline_keyboard?.flat() || [];
}

test('bot workspace commit approval uses repository cancel fallback, executes only after approval and rejects replay', async () => {
  const bot = new NexaDevBot({ TELEGRAM_WEBHOOK_SECRET: 'workspace-test-secret' });
  bot.approvals = new ApprovalService({
    secret: 'workspace-test-secret',
    replayStore: oneShotReplayStore()
  });

  const routeCalls = [];
  bot.router = {
    async dispatchCallback(data, context) {
      routeCalls.push({ data, context: structuredClone(context) });
      if (data !== `wscommit:${REPO_ID}:${INTENT_ID}`) return null;
      if (context.approved === true) {
        return {
          text: '✅ committed',
          reply_markup: { inline_keyboard: [[{ text: 'project', callback_data: `repo:${REPO_ID}` }]] }
        };
      }
      return {
        ok: false,
        pluginId: 'github',
        actionId: 'github.workspace.commit_branch',
        risk: 'WRITE',
        requiresApproval: true,
        denied: false,
        approval: {
          input: { repoId: REPO_ID, intentId: INTENT_ID },
          label: 'Commit روی branch جدید',
          cancelCallback: `repo:${REPO_ID}`
        }
      };
    }
  };

  const edits = [];
  bot.telegram = {
    async answerCallbackQuery() { return { ok: true }; },
    async editMessageText(chatId, messageId, text, replyMarkup) {
      edits.push({ chatId, messageId, text, replyMarkup });
      return { ok: true };
    }
  };

  const baseQuery = {
    id: 'cb-1',
    from: { id: OWNER },
    message: { chat: { id: 7 }, message_id: 9 }
  };
  const prepare = await bot.handleCallbackQuery({ ...baseQuery, data: `wscommit:${REPO_ID}:${INTENT_ID}` });
  assert.equal(prepare.approvalRequired, true);
  assert.equal(routeCalls.length, 1);
  assert.notEqual(routeCalls[0].context.approved, true);

  const approvalButtons = buttons(edits.at(-1).replyMarkup);
  const confirm = approvalButtons.find(button => button.callback_data?.startsWith('approve:'));
  const cancel = approvalButtons.find(button => button.text.includes('انصراف'));
  assert.ok(confirm);
  assert.equal(cancel.callback_data, `repo:${REPO_ID}`);
  assert.ok(new TextEncoder().encode(confirm.callback_data).byteLength <= 64);

  const approved = await bot.handleCallbackQuery({ ...baseQuery, id: 'cb-2', data: confirm.callback_data });
  assert.equal(approved.approved, true);
  assert.equal(routeCalls.length, 2);
  assert.equal(routeCalls[1].data, `wscommit:${REPO_ID}:${INTENT_ID}`);
  assert.deepEqual(routeCalls[1].context, { isOwner: true, ownerId: String(OWNER), approved: true });
  assert.match(edits.at(-1).text, /committed/);

  const replay = await bot.handleCallbackQuery({ ...baseQuery, id: 'cb-3', data: confirm.callback_data });
  assert.equal(replay.approvalRejected, true);
  assert.match(replay.error, /already used/i);
  assert.equal(routeCalls.length, 2);
});
