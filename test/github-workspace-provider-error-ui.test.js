import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { ApprovalService } from '../src/core/approval.js';

function replayStore() {
  return { async consume() { return true; } };
}

test('workspace approved provider errors are HTML-escaped before Telegram rendering', async () => {
  const bot = new NexaDevBot({ TELEGRAM_WEBHOOK_SECRET: 'test-secret' });
  bot.approvals = new ApprovalService({ secret: 'test-secret', replayStore: replayStore() });
  bot.router = {
    async dispatchCallback(data, context) {
      if (context?.approved === true) throw new Error('GitHub provider <bad>& response');
      return null;
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

  const token = await bot.approvals.issue({
    pluginId: 'github',
    actionId: 'github.workspace.commit_branch',
    risk: 'WRITE',
    ownerId: '42',
    input: { repoId: 123, intentId: 'Ab12_cdE' }
  });
  const result = await bot.handleCallbackQuery({
    id: 'cb',
    from: { id: 42 },
    data: `approve:${token}`,
    message: { chat: { id: 7 }, message_id: 9 }
  });

  assert.equal(result.providerError, true);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /GitHub provider &lt;bad&gt;&amp; response/);
  assert.doesNotMatch(edits[0].text, /<bad>/);
});
