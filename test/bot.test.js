import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NexaDevBot } from '../src/bot.js';

describe('Nexa Dev Bot - Webhook Dispatcher & In-Place Editing', () => {
  it('1. /start command sends a new message with Main Menu', async () => {
    const sentMessages = [];
    const bot = new NexaDevBot();
    bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
      sentMessages.push({ chatId, text, replyMarkup });
      return { ok: true, result: { message_id: 501 } };
    };

    const update = {
      update_id: 1,
      message: {
        message_id: 100,
        chat: { id: 123456 },
        text: '/start'
      }
    };

    const res = await bot.handleUpdate(update);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.command, 'start');
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].chatId, 123456);
    assert.ok(sentMessages[0].text.includes('Nexa Dev Bot'));
    assert.ok(sentMessages[0].replyMarkup.inline_keyboard);
  });

  it('2. callback_query answers callback and EDITS existing message in-place', async () => {
    const answeredCallbacks = [];
    const editedMessages = [];
    const sentMessages = [];

    const bot = new NexaDevBot();
    bot.telegram.answerCallbackQuery = async (id, text) => {
      answeredCallbacks.push({ id, text });
      return { ok: true };
    };
    bot.telegram.editMessageText = async (chatId, messageId, text, replyMarkup) => {
      editedMessages.push({ chatId, messageId, text, replyMarkup });
      return { ok: true };
    };
    bot.telegram.sendMessage = async () => {
      sentMessages.push(true);
      return { ok: true };
    };

    // Simulate clicking "📁 مخزن‌ها"
    const update = {
      update_id: 2,
      callback_query: {
        id: 'cb_999',
        data: 'menu:repos',
        message: {
          message_id: 501,
          chat: { id: 123456 }
        }
      }
    };

    const res = await bot.handleUpdate(update);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.edited, true);

    // 1. Answer callback was called to remove Telegram spinner
    assert.strictEqual(answeredCallbacks.length, 1);
    assert.strictEqual(answeredCallbacks[0].id, 'cb_999');

    // 2. Message was EDITED in-place (no new message sent)
    assert.strictEqual(editedMessages.length, 1);
    assert.strictEqual(sentMessages.length, 0, 'No new messages should be sent to prevent chat clutter');
    assert.strictEqual(editedMessages[0].chatId, 123456);
    assert.strictEqual(editedMessages[0].messageId, 501);
    assert.ok(editedMessages[0].text.includes('فهرست مخزن‌ها'));
  });

  it('3. Full multi-tier navigation loop with back-stack on single message', async () => {
    const edits = [];
    const bot = new NexaDevBot();
    bot.telegram.answerCallbackQuery = async () => ({ ok: true });
    bot.telegram.editMessageText = async (chatId, messageId, text, replyMarkup) => {
      edits.push({ text, replyMarkup });
      return { ok: true };
    };

    const msgContext = { message_id: 501, chat: { id: 123456 } };

    // Step A: User selects Factor-easy repository
    await bot.handleUpdate({
      callback_query: { id: '1', data: 'repo:Factor-easy', message: msgContext }
    });
    assert.ok(edits[0].text.includes('پروژه: Factor-easy'));

    // Step B: User opens Pull Requests
    await bot.handleUpdate({
      callback_query: { id: '2', data: 'pr:Factor-easy', message: msgContext }
    });
    assert.ok(edits[1].text.includes('Pull Requestهای پروژه Factor-easy'));
    assert.ok(edits[1].text.includes('#43'));
    assert.ok(edits[1].text.includes('Ops: strengthen long-running execution heartbeat rule'));

    // Step C: User clicks Back -> returns to Factor-easy detail
    await bot.handleUpdate({
      callback_query: { id: '3', data: 'repo:Factor-easy', message: msgContext }
    });
    assert.ok(edits[2].text.includes('پروژه: Factor-easy'));

    // Step D: User clicks Back -> returns to Repos list
    await bot.handleUpdate({
      callback_query: { id: '4', data: 'menu:repos', message: msgContext }
    });
    assert.ok(edits[3].text.includes('فهرست مخزن‌ها'));

    // Step E: User clicks Back -> returns to Main Menu
    await bot.handleUpdate({
      callback_query: { id: '5', data: 'menu:main', message: msgContext }
    });
    assert.ok(edits[4].text.includes('Nexa Dev Bot'));

    // Total steps: 5 edits on the SAME message, zero extra messages created!
    assert.strictEqual(edits.length, 5);
  });
});
