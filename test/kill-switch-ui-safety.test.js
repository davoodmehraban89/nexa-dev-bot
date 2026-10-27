import test from 'node:test';
import assert from 'node:assert/strict';
import { KillSwitchGuidedNexaDevBot } from '../src/kill-switch-bot.js';

function setup() {
  const edits = [],
    writes = [];
  const bot = new KillSwitchGuidedNexaDevBot({ OWNER_TELEGRAM_ID: '42' });
  bot.killSwitch = {
    status: async () => ({ mode: 'LOCKED' }),
    lock: async () => {
      writes.push('lock');
      return { mode: 'LOCKED' };
    },
    unlock: async () => {
      writes.push('unlock');
      return { mode: 'NORMAL' };
    }
  };
  bot.telegram = {
    answerCallbackQuery: async () => {},
    editMessageText: async (...args) => {
      edits.push(args);
    },
    sendMessage: async (...args) => {
      edits.push(args);
    }
  };
  bot.audit = { log() {} };
  return { bot, edits, writes };
}

test('locked state exposes navigation without an unauthenticated unlock button', async () => {
  const { bot, edits } = setup();
  await bot.handleMessage({ chat: { id: 42 }, text: '/killswitch' });
  const markup = edits[0][2];
  assert.ok(
    markup.inline_keyboard
      .flat()
      .some((button) => button.callback_data === 'menu:main')
  );
  assert.equal(
    markup.inline_keyboard
      .flat()
      .some((button) => button.callback_data.includes('unlock')),
    false
  );
});

for (const data of ['killswitch:unlock', 'killswitch:confirm-unlock']) {
  test(`stale ${data} cannot mutate state without signed approval and TOTP`, async () => {
    const { bot, edits, writes } = setup();
    const result = await bot.handleCallbackQuery({
      id: 'query',
      data,
      from: { id: 42 },
      message: { chat: { id: 42 }, message_id: 1 }
    });
    assert.deepEqual(writes, []);
    assert.equal(result.ok, false);
    assert.match(edits[0][2], /TOTP/);
  });
}
