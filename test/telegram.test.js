import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramClient } from '../src/telegram.js';

test('TelegramClient fails closed when TELEGRAM_BOT_TOKEN is missing', async () => {
  const client = new TelegramClient('');

  await assert.rejects(
    () => client.sendMessage(1, 'hello'),
    /TELEGRAM_BOT_TOKEN is not configured/i
  );
});

test('TelegramClient rejects HTTP-level Telegram API failures', async () => {
  const client = new TelegramClient('token', {
    fetch: async () => new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
  });

  await assert.rejects(
    () => client.sendMessage(1, 'hello'),
    /Telegram API sendMessage failed: 400.*Bad Request/i
  );
});

test('TelegramClient rejects Telegram ok:false responses even with HTTP 200', async () => {
  const client = new TelegramClient('token', {
    fetch: async () => new Response(JSON.stringify({ ok: false, description: 'message is not modified' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });

  await assert.rejects(
    () => client.editMessageText(1, 2, 'same'),
    /message is not modified/i
  );
});

test('TelegramClient invokes the default fetch without a TelegramClient receiver', async () => {
  const originalFetch = globalThis.fetch;
  let observedThis;

  globalThis.fetch = async function () {
    observedThis = this;
    if (this instanceof TelegramClient) {
      throw new TypeError('Illegal invocation: function called with incorrect this reference');
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const client = new TelegramClient('token');
    await client.sendMessage(1, 'hello');
    assert.notEqual(observedThis, client);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
