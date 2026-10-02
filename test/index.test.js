import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const runtime = {
  TELEGRAM_WEBHOOK_SECRET: 'unit-test-secret',
  OWNER_TELEGRAM_ID: '123',
  TELEGRAM_BOT_TOKEN: '',
  GITHUB_TOKEN: 'unit-test-github'
};

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

  it('GET /status returns service status payload', async () => {
    const res = await worker.fetch(new Request('https://example.test/status', { method: 'GET' }), runtime);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.text.includes('وضعیت سیستم و سرویس'));
    assert.ok(body.reply_markup);
    assert.doesNotMatch(body.text, /100% SLA/i);
  });

  it('authorized Telegram webhook processes /start', async () => {
    const update = {
      update_id: 101,
      message: {
        message_id: 202,
        from: { id: 123 },
        chat: { id: 123 },
        text: '/start'
      }
    };
    const req = new Request('https://example.test/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'unit-test-secret'
      },
      body: JSON.stringify(update)
    });
    const res = await worker.fetch(req, runtime);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.command, 'start');
  });

  it('arbitrary POST paths are not treated as webhooks', async () => {
    const res = await worker.fetch(new Request('https://example.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }), runtime);
    assert.equal(res.status, 404);
  });
});
