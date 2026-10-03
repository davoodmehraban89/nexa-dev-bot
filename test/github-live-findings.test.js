import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';

test('Issues 403 tells the owner the exact fine-grained permission required', async () => {
  const bot = new NexaDevBot({
    TELEGRAM_BOT_TOKEN: 'telegram-test-token',
    TELEGRAM_WEBHOOK_SECRET: 'webhook-test-secret',
    GITHUB_TOKEN: 'github-test-token'
  });
  const edits = [];
  bot.telegram.answerCallbackQuery = async () => ({ ok: true });
  bot.telegram.editMessageText = async (chatId, messageId, text, replyMarkup) => {
    edits.push({ chatId, messageId, text, replyMarkup });
    return { ok: true };
  };
  bot.router.dispatchCallback = async () => {
    throw new Error('GitHub issues failed: 403 Resource not accessible by personal access token');
  };

  const result = await bot.handleCallbackQuery({
    id: 'cb-issues-permission',
    data: 'issues:123',
    from: { id: 42 },
    message: { chat: { id: 42 }, message_id: 99 }
  });

  assert.equal(result.ok, false);
  assert.equal(result.edited, true);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /Issues/i);
  assert.match(edits[0].text, /Read/i);
  assert.match(edits[0].text, /fine-grained|Fine-grained/i);
});

test('empty Releases view clearly states that GitHub has no releases for the repository', async () => {
  const github = {
    async getRepository(id) { return { id: String(id), name: 'nexa-dev-bot', defaultBranch: 'main' }; },
    async listReleases() { return []; }
  };
  const menu = {
    async getReposListView() { return { text: 'repos', reply_markup: { inline_keyboard: [] } }; },
    async renderByCallback() { return { text: 'menu', reply_markup: { inline_keyboard: [] } }; }
  };
  const plugin = createGitHubPlugin({ github, menu });
  const view = await plugin.resolveCallback('releases:123').execute();

  assert.match(view.text, /هیچ Release منتشرشده‌ای برای این مخزن در GitHub وجود ندارد/);
  assert.doesNotMatch(view.text, /Releaseی یافت نشد/);
});
