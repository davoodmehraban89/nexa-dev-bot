import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  makeReplayNamespace,
  withUpdateId
} from './helpers/replay-namespace.js';

function telegramRequest(secret, update) {
  const headers = { 'content-type': 'application/json' };
  if (secret !== undefined) headers['X-Telegram-Bot-Api-Secret-Token'] = secret;

  return new Request('https://example.com/telegram/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(withUpdateId(update))
  });
}

test('webhook fails closed when TELEGRAM_WEBHOOK_SECRET is missing', async () => {
  const req = telegramRequest(undefined, {
    message: { text: '/status', from: { id: 123 }, chat: { id: 123 } }
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const res = await worker.fetch(req, {
    OWNER_TELEGRAM_ID: '123',
    TELEGRAM_BOT_TOKEN: 'token'
  });

  assert.equal(res.status, 503);
  assert.equal(calls, 0);
});

test('webhook rejects a wrong Telegram secret', async () => {
  const req = telegramRequest('wrong', {
    message: { text: '/status', from: { id: 123 }, chat: { id: 123 } }
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('should not call network');
  };

  const res = await worker.fetch(req, {
    APPROVAL_REPLAY_GUARD: makeReplayNamespace(),
    TELEGRAM_WEBHOOK_SECRET: 'right',
    OWNER_TELEGRAM_ID: '123',
    TELEGRAM_BOT_TOKEN: 'token'
  });

  assert.equal(res.status, 403);
  assert.equal(calls, 0);
});

test('unauthorized Telegram users receive no bot response', async () => {
  const req = telegramRequest('right', {
    message: { text: '/status', from: { id: 999 }, chat: { id: 999 } }
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const res = await worker.fetch(req, {
    APPROVAL_REPLAY_GUARD: makeReplayNamespace(),
    TELEGRAM_WEBHOOK_SECRET: 'right',
    OWNER_TELEGRAM_ID: '123',
    TELEGRAM_BOT_TOKEN: 'token'
  });

  assert.equal(res.status, 200);
  assert.equal(calls, 0);
});

test('temporary setup endpoint is disabled after webhook registration', async () => {
  const req = new Request(
    'https://nexa-dev-bot.example.workers.dev/telegram/setup',
    {
      method: 'GET'
    }
  );

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('setup endpoint must not call Telegram after registration');
  };

  const res = await worker.fetch(req, {
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    TELEGRAM_BOT_TOKEN: 'token'
  });

  assert.equal(res.status, 404);
  assert.equal(calls, 0);
});

test('temporary diagnostic command no longer exposes Telegram ID', async () => {
  const req = telegramRequest('right', {
    message: { text: '/diag', from: { id: 123 }, chat: { id: 123 } }
  });

  const messages = [];
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    messages.push(payload.text);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const res = await worker.fetch(req, {
    APPROVAL_REPLAY_GUARD: makeReplayNamespace(),
    TELEGRAM_WEBHOOK_SECRET: 'right',
    OWNER_TELEGRAM_ID: '123',
    TELEGRAM_BOT_TOKEN: 'token'
  });

  assert.equal(res.status, 200);
  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], /Telegram ID|Authorization:|\b123\b/);
});
