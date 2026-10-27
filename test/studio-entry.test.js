import test from 'node:test';
import assert from 'node:assert/strict';
import { GuidedNexaDevBot } from '../src/guide-bot.js';
import { KillSwitchGuidedNexaDevBot } from '../src/kill-switch-bot.js';
import * as config from '../src/config.js';
import { TelegramClient } from '../src/telegram.js';

const STUDIO_URL = 'https://acceptance.test/studio/';
const ownerMessage = (text, extra = {}) => ({
  message_id: 1,
  from: { id: 42 },
  chat: { id: 42, type: 'private' },
  text,
  ...extra
});

function studioBot(env = {}, { failMenu = false } = {}) {
  const bot = new KillSwitchGuidedNexaDevBot({
    OWNER_TELEGRAM_ID: '42',
    TELEGRAM_BOT_TOKEN: 'synthetic-bot-credential',
    STUDIO_URL,
    ...env
  });
  const effects = [];
  bot.telegram.fetchFn = async (url, options) => {
    const method = new URL(url).pathname.split('/').at(-1);
    const payload = JSON.parse(options.body);
    effects.push({ method, payload });
    if (method === 'setChatMenuButton' && failMenu)
      throw new Error('PRIVATE_PROVIDER_ERROR_SENTINEL');
    return Response.json({
      ok: true,
      result:
        method === 'sendMessage' || method === 'editMessageText'
          ? { message_id: 10, chat: { id: 42, type: 'private' } }
          : true
    });
  };
  return { bot, effects };
}

function assertStudioButton(payload) {
  assert.deepEqual(payload.reply_markup, {
    inline_keyboard: [
      [{ text: 'باز کردن Nexa Studio', web_app: { url: STUDIO_URL } }]
    ]
  });
  assert.match(payload.text, /Nexa Studio/);
}

test('/start clears the old keyboard and offers a single Studio launch action', async () => {
  const { bot, effects } = studioBot();
  const result = await bot.handleUpdate({ message: ownerMessage('/start') });
  const sent = effects.filter(({ method }) => method === 'sendMessage');

  assert.equal(result.ok, true);
  assert.equal(result.command, 'start');
  assert.equal(result.studioEntry, true);
  assert.equal(result.menuButtonConfigured, true);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].payload.reply_markup, { remove_keyboard: true });
  assertStudioButton(sent[1].payload);
  assert.deepEqual(
    effects.find(({ method }) => method === 'setChatMenuButton')?.payload,
    {
      chat_id: 42,
      menu_button: {
        type: 'web_app',
        text: 'Nexa Studio',
        web_app: { url: STUDIO_URL }
      }
    }
  );
  assert.equal(
    effects.some(({ payload }) => payload.reply_markup?.keyboard),
    false
  );
});

test('/menu and the stale main quick-menu text launch Studio before pending input', async (t) => {
  for (const text of ['/menu', '🏠 منوی اصلی']) {
    await t.test(text, async () => {
      const { bot, effects } = studioBot();
      bot.workspaceStore = {
        isConfigured: () => true,
        async getPendingInput() {
          assert.fail('main navigation must precede stale workspace input');
        }
      };
      const result = await bot.handleMessage(ownerMessage(text));

      assert.equal(result.ok, true);
      assert.equal(result.studioEntry, true);
      assertStudioButton(effects.at(-1).payload);
      assert.equal(
        effects.some(({ method }) => method === 'setChatMenuButton'),
        false
      );
    });
  }
});

test('start payloads launch Studio but unrelated start-like commands do not configure a menu', async () => {
  const { bot, effects } = studioBot();
  await bot.handleMessage(ownerMessage('/start@NexaBot launch'));
  assertStudioButton(effects.at(-1).payload);
  assert.equal(
    effects.filter(({ method }) => method === 'setChatMenuButton').length,
    1
  );

  effects.length = 0;
  await bot.handleMessage(ownerMessage('/starter'));
  assert.equal(
    effects.some(({ method }) => method === 'setChatMenuButton'),
    false
  );
});

test('menu setup failure keeps the primary launch action and returns metadata only', async () => {
  const { bot, effects } = studioBot({}, { failMenu: true });
  const result = await bot.handleMessage(ownerMessage('/start'));

  assert.equal(result.ok, true);
  assert.equal(result.menuButtonConfigured, false);
  assertStudioButton(effects.at(-1).payload);
  assert.equal(
    JSON.stringify(result).includes('PRIVATE_PROVIDER_ERROR_SENTINEL'),
    false
  );
});

test('direct entry handlers require the configured owner and that owner’s private chat before effects', async (t) => {
  for (const message of [
    ownerMessage('/start', { from: { id: 7 } }),
    ownerMessage('/start', { from: undefined }),
    ownerMessage('/start', { chat: { id: -42, type: 'group' } }),
    ownerMessage('/start', { chat: { id: 99, type: 'private' } }),
    ownerMessage('/start', { chat: { id: 42 } }),
    ownerMessage('/menu', { chat: { id: 42, type: 'supergroup' } })
  ]) {
    await t.test(JSON.stringify(message), async () => {
      const { bot, effects } = studioBot();
      const result = await bot.handleMessage(message);
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'owner_private_chat_required');
      assert.deepEqual(effects, []);
    });
  }
  const { bot, effects } = studioBot({ OWNER_TELEGRAM_ID: '' });
  assert.equal((await bot.handleMessage(ownerMessage('/start'))).ok, false);
  assert.deepEqual(effects, []);
});

test('main-menu callback edits the primary Studio entry without setting chat configuration', async () => {
  const { bot, effects } = studioBot();
  const result = await bot.handleCallbackQuery({
    id: 'main',
    data: 'menu:main',
    from: { id: 42 },
    message: ownerMessage(undefined)
  });

  assert.equal(result.ok, true);
  assert.equal(result.edited, true);
  assert.deepEqual(
    effects.map(({ method }) => method),
    ['answerCallbackQuery', 'editMessageText']
  );
  assertStudioButton(effects.at(-1).payload);
});

test('main-menu callback fails closed outside the owner private chat', async () => {
  const { bot, effects } = studioBot();
  const result = await bot.handleCallbackQuery({
    id: 'main',
    data: 'menu:main',
    from: { id: 7 },
    message: ownerMessage(undefined)
  });
  assert.equal(result.ok, false);
  assert.deepEqual(effects, []);
});

test('invalid explicit Studio URLs produce a fixed Persian error without exposing URL input', async (t) => {
  for (const value of [
    '',
    null,
    'http://acceptance.test/studio/',
    'https://PRIVATE_URL_SENTINEL:secret@acceptance.test/studio/',
    'https://acceptance.test/studio/?token=PRIVATE_URL_SENTINEL',
    'https://acceptance.test/studio/?',
    'https://acceptance.test/studio/#PRIVATE_URL_SENTINEL',
    'https://acceptance.test/studio/#',
    'https://acceptance.test/workspace/editor',
    'PRIVATE_URL_SENTINEL'
  ]) {
    await t.test(String(value), async () => {
      const { bot, effects } = studioBot({ STUDIO_URL: value });
      const result = await bot.handleMessage(ownerMessage('/start'));
      assert.equal(result.ok, false);
      assert.equal(result.invalidStudioUrl, true);
      assert.equal(effects.length, 1);
      assert.equal(effects[0].method, 'sendMessage');
      assert.equal(
        effects[0].payload.text,
        '⚠️ نشانی Nexa Studio پیکربندی نشده است. با مدیر ربات تماس بگیرید.'
      );
      assert.deepEqual(effects[0].payload.reply_markup, {
        remove_keyboard: true
      });
      assert.equal(
        JSON.stringify({ effects, result }).includes('PRIVATE_URL_SENTINEL'),
        false
      );
    });
  }
});

test('Studio URLs normalize the exact HTTPS route and default only when unspecified', async () => {
  assert.equal(typeof config.studioAppUrl, 'function');
  assert.equal(
    config.studioAppUrl('https://acceptance.test/studio'),
    STUDIO_URL
  );
  assert.equal(config.studioAppUrl(STUDIO_URL), STUDIO_URL);
  assert.equal(
    config.studioAppUrl(),
    'https://nexa-dev-bot.davoodmehraban89.workers.dev/studio/'
  );
  for (const value of [
    '',
    null,
    42,
    'https://acceptance.test/studio/child',
    'https://acceptance.test/studio//'
  ])
    assert.equal(config.studioAppUrl(value), '');
});

test('TelegramClient sends a scoped web_app chat menu payload through the Bot API', async () => {
  const calls = [];
  const client = new TelegramClient('synthetic-bot-credential', {
    fetch: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      return Response.json({ ok: true, result: true });
    }
  });
  assert.equal(typeof client.setChatMenuButton, 'function');
  await client.setChatMenuButton(42, {
    type: 'web_app',
    text: 'Nexa Studio',
    web_app: { url: STUDIO_URL }
  });
  assert.equal(
    new URL(calls[0].url).pathname.split('/').at(-1),
    'setChatMenuButton'
  );
  assert.deepEqual(calls[0].payload, {
    chat_id: 42,
    menu_button: {
      type: 'web_app',
      text: 'Nexa Studio',
      web_app: { url: STUDIO_URL }
    }
  });
});

test('the existing secret guard intercepts token messages before any Studio launch effects', async () => {
  const { bot, effects } = studioBot();
  const result = await bot.handleUpdate({
    message: ownerMessage('github_pat_synthetic_noncredential_fixture')
  });
  assert.equal(result.secretRejected, true);
  assert.deepEqual(
    effects.map(({ method }) => method),
    ['deleteMessage', 'sendMessage']
  );
});

test('direct start handling rejects a token caption before configuring the chat menu', async () => {
  const { bot, effects } = studioBot();
  const result = await bot.handleMessage(
    ownerMessage('/start', {
      caption: 'github_pat_synthetic_noncredential_fixture'
    })
  );
  assert.equal(result.secretRejected, true);
  assert.deepEqual(
    effects.map(({ method }) => method),
    ['deleteMessage', 'sendMessage']
  );
});

test('legacy guide routing stays available without restoring a persistent keyboard', async () => {
  const bot = new GuidedNexaDevBot({ OWNER_TELEGRAM_ID: '42' });
  const sent = [];
  bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
    return { ok: true };
  };
  const result = await bot.handleMessage(ownerMessage('📘 راهنما'));
  assert.equal(result.quickMenu, 'help');
  assert.match(sent[0].text, /راهنمای Nexa Dev/);
});
