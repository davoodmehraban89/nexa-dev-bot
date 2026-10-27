import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';

test('Advanced READ provider failures visibly update Telegram instead of appearing silent', async () => {
  const bot = new NexaDevBot({
    TELEGRAM_BOT_TOKEN: 'telegram-test-token',
    TELEGRAM_WEBHOOK_SECRET: 'webhook-test-secret',
    GITHUB_TOKEN: 'github-test-token'
  });
  const edits = [];
  bot.telegram.answerCallbackQuery = async () => ({ ok: true });
  bot.telegram.editMessageText = async (
    chatId,
    messageId,
    text,
    replyMarkup
  ) => {
    edits.push({ chatId, messageId, text, replyMarkup });
    return { ok: true };
  };
  bot.router.dispatchCallback = async () => {
    throw new Error(
      'GitHub check runs failed: 403 Resource not accessible by personal access token'
    );
  };

  const result = await bot.handleCallbackQuery({
    id: 'cb-read-error',
    data: 'prchecks:123:19:1',
    from: { id: 42 },
    message: { chat: { id: 42 }, message_id: 99 }
  });

  assert.equal(result.ok, false);
  assert.equal(result.edited, true);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /دریافت اطلاعات|خطا/);
  assert.match(edits[0].text, /مجوز|دسترسی/);
  assert.doesNotMatch(
    edits[0].text,
    /github-test-token|telegram-test-token|webhook-test-secret/
  );
});
