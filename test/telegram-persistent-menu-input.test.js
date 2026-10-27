import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { GuidedNexaDevBot } from '../src/guide-bot.js';

const WORKSPACE_ID = 'W000000001';

test('/start replaces the legacy persistent keyboard with the Studio launch button', async () => {
  const bot = new GuidedNexaDevBot({ OWNER_TELEGRAM_ID: '7' });
  const sent = [];
  bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
    return { ok: true, result: { message_id: 100 + sent.length } };
  };
  bot.telegram.setChatMenuButton = async () => ({ ok: true });

  const result = await bot.handleMessage({
    chat: { id: 7, type: 'private' },
    from: { id: 7 },
    text: '/start'
  });

  assert.equal(result.ok, true);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].replyMarkup, { remove_keyboard: true });
  assert.deepEqual(sent[1].replyMarkup, {
    inline_keyboard: [
      [
        {
          text: 'باز کردن Nexa Studio',
          web_app: {
            url: 'https://nexa-dev-bot.davoodmehraban89.workers.dev/studio/'
          }
        }
      ]
    ]
  });
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
      return {
        text: 'should not happen',
        reply_markup: { inline_keyboard: [] }
      };
    }
  };
  bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
    return { ok: true };
  };

  const result = await bot.handleMessage({
    chat: { id: 7 },
    from: { id: 42 },
    text: '🏠 منوی اصلی'
  });

  assert.equal(result.ok, true);
  assert.equal(result.quickMenu, 'main');
  assert.equal(pendingReads, 0);
  assert.equal(workspaceDispatches, 0);
  assert.match(sent.at(-1).text, /Nexa Dev Bot/);
});

test('legacy Paste callbacks replace the workspace message with the Mini App redirect', async () => {
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
      text: 'متن را فقط در Mini App ویرایش کنید',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Editor', web_app: { url: 'https://example.test/editor' } }]
        ]
      }
    };
  };

  const result = await bot.handleCallbackQuery({
    id: 'cb-paste',
    data: `wtext:${WORKSPACE_ID}`,
    from: { id: 42 },
    message: { message_id: 55, chat: { id: 7 } }
  });

  assert.equal(result.ok, true);
  assert.equal(result.edited, true);
  assert.equal(result.inputPrompt, undefined);
  assert.equal(sent.length, 0);
  assert.equal(edited.length, 1);
  assert.equal(edited[0][1], 55);
  assert.equal(edited[0][3].force_reply, undefined);
  assert.equal(
    edited[0][3].inline_keyboard[0][0].web_app.url,
    'https://example.test/editor'
  );
});

test('stale draft input sends only pending metadata to the Mini App redirect route', async () => {
  const bot = new NexaDevBot({});
  const pending = { workspaceId: WORKSPACE_ID, mode: 'draft' };
  const payloadKeys = [];
  const sent = [];
  bot.workspaceStore = {
    isConfigured: () => true,
    async getPendingInput() {
      return pending;
    }
  };
  bot.router.dispatchMessage = async (payload, context) => {
    payloadKeys.push(Object.keys(payload));
    assert.deepEqual(payload.pending, pending);
    assert.equal(context.ownerId, '42');
    return { text: 'ویرایش فقط در Mini App' };
  };
  bot.telegram.sendMessage = async (chatId, text) => {
    sent.push({ chatId, text });
    return { ok: true };
  };

  const result = await bot.handleMessage({
    message_id: 55,
    chat: { id: 7 },
    from: { id: 42 },
    text: 'SOURCE_BODY_MUST_NOT_REACH_CONTROLLER'
  });

  assert.deepEqual(payloadKeys, [['pending']]);
  assert.equal(result.workspaceInput, true);
  assert.equal(
    JSON.stringify({ sent, result }).includes('SOURCE_BODY_'),
    false
  );
});

test('stale upload input redirects before downloading or requesting another file', async () => {
  for (const document of [
    undefined,
    { file_id: 'synthetic-file', file_size: 10 }
  ]) {
    const bot = new NexaDevBot({});
    let downloads = 0;
    const payloadKeys = [];
    bot.workspaceStore = {
      isConfigured: () => true,
      async getPendingInput() {
        return { workspaceId: WORKSPACE_ID, mode: 'draft_file' };
      }
    };
    bot.telegram.downloadTextFile = async () => {
      downloads++;
      return { text: 'SOURCE_BODY', byteLength: 11 };
    };
    bot.router.dispatchMessage = async (payload) => {
      payloadKeys.push(Object.keys(payload));
      return { text: 'ویرایش فقط در Mini App' };
    };
    bot.telegram.sendMessage = async () => ({ ok: true });

    const result = await bot.handleMessage({
      chat: { id: 7 },
      from: { id: 42 },
      document
    });

    assert.equal(downloads, 0);
    assert.deepEqual(payloadKeys, [['pending']]);
    assert.equal(result.workspaceInput, true);
    assert.equal(result.inputRequired, undefined);
  }
});
