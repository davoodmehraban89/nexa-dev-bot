import { describe, it } from 'node:test';
import assert from 'node:assert';
import worker from '../src/index.js';

describe('Nexa Dev Bot - Cloudflare Worker Entrypoint', () => {
  it('1. GET / returns online status with version info', async () => {
    const req = new Request('https://nexa-dev-bot.davoodmehraban.workers.dev/', {
      method: 'GET'
    });
    const res = await worker.fetch(req);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.status, 'online');
    assert.strictEqual(body.bot, 'Nexa Dev Bot');
    assert.strictEqual(body.version, '1.1.0');
  });

  it('2. GET /status returns service status payload', async () => {
    const req = new Request('https://nexa-dev-bot.davoodmehraban.workers.dev/status', {
      method: 'GET'
    });
    const res = await worker.fetch(req);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(body.text.includes('وضعیت سیستم و سرویس‌های فعال'));
    assert.ok(body.reply_markup);
  });

  it('3. POST / processes Telegram webhook updates seamlessly', async () => {
    const update = {
      update_id: 101,
      message: {
        message_id: 202,
        chat: { id: 88888 },
        text: '/start'
      }
    };
    const req = new Request('https://nexa-dev-bot.davoodmehraban.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    const res = await worker.fetch(req);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.command, 'start');
  });
});
