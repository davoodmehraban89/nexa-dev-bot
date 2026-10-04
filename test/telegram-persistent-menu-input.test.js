import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';

const WORKSPACE_ID = 'W000000001';

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

test('Paste text opens a focused ForceReply prompt without replacing the workspace message', async () => {
  const bot = new NexaDevBot({});
  const sent = [];
  const edited = [];

  bot.telegram.answerCallbackQuery = async () => ({ ok: true });
  bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
    return { ok: true };
  };
  bot.telegram.editMessageText = async (...args) => {
    edited.push(args);
    return { ok: true };
  };
  bot.router.dispatchCallback = async (data) => {
    assert.equal(data, `wtext:${WORKSPACE_ID}`);
    return {
      text: '📝 متن جدید Draft را ارسال کنید',
      reply_markup: { inline_keyboard: [[{ text: '↩️ بازگشت', callback_data: `ws:${WORKSPACE_ID}` }]] }
    };
  };

  const result = await bot.handleCallbackQuery({
    id: 'cb-paste',
    data: `wtext:${WORKSPACE_ID}`,
    from: { id: 42 },
    message: { message_id: 55, chat: { id: 7 } }
  });

  assert.equal(result.ok, true);
  assert.equal(result.inputPrompt, true);
  assert.equal(edited.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].replyMarkup.force_reply, true);
  assert.equal(sent[0].replyMarkup.selective, true);
  assert.match(sent[0].replyMarkup.input_field_placeholder, /Paste|کد|متن/i);
  assert.equal(sent[0].replyMarkup.inline_keyboard, undefined);
});
