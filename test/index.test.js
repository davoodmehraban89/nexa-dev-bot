import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const runtime = {
  TELEGRAM_WEBHOOK_SECRET: 'unit-test-secret',
  OWNER_TELEGRAM_ID: '123',
  TELEGRAM_BOT_TOKEN: 'unit-test-token',
  GITHUB_TOKEN: 'unit-test-github'
};

const startUpdate = {
  update_id: 101,
  message: {
    message_id: 202,
    from: { id: 123 },
    chat: { id: 123 },
    text: '/start'
  }
};

function webhookRequest(update = startUpdate) {
  return new Request('https://example.test/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'unit-test-secret'
    },
    body: JSON.stringify(update)
  });
}

describe('Nexa Dev Bot - Cloudflare Worker Entrypoint', () => {
  it('GET / returns online status without fabricated uptime', async () => {
    const res = await worker.fetch(new Request('https://example.test/', { method: 'GET' }), runtime);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'online');
    assert.equal(body.bot, 'Nexa Dev Bot');
    assert.equal(body.version, '1.1.1');
    assert.equal('uptime' in body, false);
  });

  it('GET /status returns the operational status payload without requiring an external network call', async () => {
    const res = await worker.fetch(new Request('https://example.test/status', { method: 'GET' }), {
      ...runtime,
      GITHUB_TOKEN: ''
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.text.includes('وضعیت زنده Nexa Dev'));
    assert.ok(body.text.includes('GitHub live READ'));
    assert.ok(body.text.includes('WORKSPACE_STORE'));
    assert.ok(body.reply_markup);
    assert.doesNotMatch(body.text, /100% SLA|ms latency/i);
  });

  it('authorized Telegram webhook processes /start', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://api.telegram.org/')) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 303 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return originalFetch(url);
    };

    try {
      const res = await worker.fetch(webhookRequest(), runtime);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.command, 'start');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('webhook fails closed when TELEGRAM_BOT_TOKEN is missing', async () => {
    const res = await worker.fetch(webhookRequest(), {
      ...runtime,
      TELEGRAM_BOT_TOKEN: ''
    });

    assert.equal(res.status, 503);
    assert.match(await res.text(), /Telegram bot token not configured/i);
  });

  it('arbitrary POST paths are not treated as webhooks', async () => {
    const res = await worker.fetch(new Request('https://example.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }), runtime);
    assert.equal(res.status, 404);
  });

  it('logs Telegram webhook processing failures without exposing configured secrets', async () => {
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const logs = [];
    const secretToken = 'telegram-secret-token-for-test';
    const approvalSecret = 'approval-secret-for-test';

    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://api.telegram.org/')) {
        return new Response(JSON.stringify({
          ok: false,
          description: `Unauthorized ${approvalSecret}`
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        });
      }
      return originalFetch(url);
    };
    console.error = (...args) => logs.push(args.map(String).join(' '));

    try {
      const res = await worker.fetch(webhookRequest(), {
        ...runtime,
        TELEGRAM_BOT_TOKEN: secretToken,
        APPROVAL_SIGNING_SECRET: approvalSecret
      });
      assert.equal(res.status, 400);
      assert.ok(logs.some(line => /telegram_webhook_error/i.test(line)));
      assert.ok(logs.some(line => /401|Unauthorized/i.test(line)));
      assert.ok(logs.every(line => !line.includes(secretToken)));
      assert.ok(logs.every(line => !line.includes(approvalSecret)));
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  });
});
