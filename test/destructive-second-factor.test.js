import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { makeReplayNamespace } from './helpers/replay-namespace.js';

const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of value.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(ch);
    if (index < 0) throw new Error('invalid base32');
    bits += index.toString(2).padStart(5, '0');
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    out.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}

async function currentTotp(secret, now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase32(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

function makeBot(secret = TOTP_SECRET) {
  const bot = new NexaDevBot({
    DESTRUCTIVE_TOTP_SECRET: secret,
    APPROVAL_REPLAY_GUARD: makeReplayNamespace()
  });
  const payload = {
    v: 1,
    pluginId: 'github',
    actionId: 'github.pull_request.merge',
    risk: 'DESTRUCTIVE',
    ownerId: '123',
    input: { repoId: 7, prNumber: 39, headSha: 'a'.repeat(40) },
    issuedAt: Date.now(),
    expiresAt: Date.now() + 120_000,
    nonce: 'nonce123'
  };
  const pending = new Map();
  let consumeCount = 0;
  let executeCount = 0;

  bot.approvals.verify = async () => payload;
  bot.approvals.consume = async () => {
    consumeCount += 1;
    return payload;
  };
  bot.replayStore.setSecondFactorPending = async ({
    ownerId,
    token,
    expiresAt
  }) => {
    pending.set(String(ownerId), { token, expiresAt });
    return true;
  };
  bot.replayStore.getSecondFactorPending = async ({ ownerId }) =>
    pending.get(String(ownerId)) || null;
  bot.replayStore.clearSecondFactorPending = async ({ ownerId }) => {
    pending.delete(String(ownerId));
    return true;
  };
  bot.router.dispatchCallback = async (_data, context) => {
    if (context?.approved) executeCount += 1;
    return { text: 'executed', reply_markup: { inline_keyboard: [] } };
  };
  bot.telegram.answerCallbackQuery = async () => ({ ok: true });
  bot.telegram.editMessageText = async (
    _chatId,
    _messageId,
    text,
    replyMarkup
  ) => ({ ok: true, result: { text, reply_markup: replyMarkup } });
  bot.telegram.sendMessage = async (_chatId, text, replyMarkup) => ({
    ok: true,
    result: { text, reply_markup: replyMarkup }
  });

  return {
    bot,
    get consumeCount() {
      return consumeCount;
    },
    get executeCount() {
      return executeCount;
    }
  };
}

test('DESTRUCTIVE approval fails closed when second-factor secret is not configured', async () => {
  const harness = makeBot('');
  const result = await harness.bot.handleUpdate({
    callback_query: {
      id: 'approve-missing-factor',
      from: { id: 123 },
      data: 'approve:signed-token',
      message: { message_id: 900, chat: { id: 123 } }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(
    harness.consumeCount,
    0,
    'approval must not be consumed without second factor'
  );
  assert.equal(
    harness.executeCount,
    0,
    'DESTRUCTIVE provider action must not execute without second factor'
  );
  assert.match(String(result.error || ''), /second factor|totp|configured/i);
});

test('DESTRUCTIVE approval requires valid TOTP before consuming approval or executing provider mutation', async () => {
  const harness = makeBot();

  const first = await harness.bot.handleUpdate({
    callback_query: {
      id: 'approve-first-factor',
      from: { id: 123 },
      data: 'approve:signed-token',
      message: { message_id: 901, chat: { id: 123 } }
    }
  });

  assert.equal(first.ok, true);
  assert.equal(first.secondFactorRequired, true);
  assert.equal(harness.consumeCount, 0);
  assert.equal(harness.executeCount, 0);

  const wrong = await harness.bot.handleUpdate({
    message: {
      message_id: 902,
      chat: { id: 123 },
      from: { id: 123 },
      text: '/totp 000000'
    }
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.secondFactorRejected, true);
  assert.equal(harness.consumeCount, 0);
  assert.equal(harness.executeCount, 0);

  const code = await currentTotp(TOTP_SECRET);
  const accepted = await harness.bot.handleUpdate({
    message: {
      message_id: 903,
      chat: { id: 123 },
      from: { id: 123 },
      text: `/totp ${code}`
    }
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.secondFactorVerified, true);
  assert.equal(harness.consumeCount, 1);
  assert.equal(harness.executeCount, 1);
});

test('TOTP code and signed approval token are never written to audit output', async () => {
  const harness = makeBot();
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.map(String).join(' '));
  try {
    await harness.bot.handleUpdate({
      callback_query: {
        id: 'approve-audit-factor',
        from: { id: 123 },
        data: 'approve:signed-token',
        message: { message_id: 904, chat: { id: 123 } }
      }
    });
    const code = await currentTotp(TOTP_SECRET);
    await harness.bot.handleUpdate({
      message: {
        message_id: 905,
        chat: { id: 123 },
        from: { id: 123 },
        text: `/totp ${code}`
      }
    });
    const output = logs.join('\n');
    assert.doesNotMatch(output, new RegExp(code));
    assert.doesNotMatch(output, /signed-token/);
  } finally {
    console.log = originalLog;
  }
});
