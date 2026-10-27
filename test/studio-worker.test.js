import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { KillSwitchGuidedNexaDevBot } from '../src/kill-switch-bot.js';
import { makeReplayNamespace } from './helpers/replay-namespace.js';

test('Worker serves Mini App entry assets and rejects unauthenticated Studio API access', async () => {
  const response = await worker.fetch(
    new Request('https://acceptance.test/studio/'),
    {
      ASSETS: {
        fetch: async () =>
          new Response(
            '<html><meta name="csp-nonce" content="__NEXA_NONCE__"></html>',
            { headers: { 'content-type': 'text/html' } }
          )
      }
    }
  );
  assert.equal(response.status, 200);
  assert.doesNotMatch(
    response.headers.get('content-security-policy'),
    /unsafe-inline/
  );
  const api = await worker.fetch(
    new Request('https://acceptance.test/api/v1/studio'),
    { TELEGRAM_BOT_TOKEN: '12345:test', OWNER_TELEGRAM_ID: '42' }
  );
  assert.equal(api.status, 403);
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

test('webhook derives primary Mini App entry from its own origin and keeps explicit configuration', async () => {
  const original = KillSwitchGuidedNexaDevBot.prototype.handleUpdate;
  KillSwitchGuidedNexaDevBot.prototype.handleUpdate = async function () {
    return { ok: true, studioUrl: this.env.STUDIO_URL };
  };
  try {
    for (const configured of [undefined, 'https://custom.test/studio/', '']) {
      const response = await worker.fetch(
        new Request('https://acceptance.test/telegram/webhook', {
          method: 'POST',
          headers: { 'X-Telegram-Bot-Api-Secret-Token': 'webhook' },
          body: JSON.stringify({
            update_id: 1,
            message: { from: { id: 42 }, chat: { id: 42 }, text: '/start' }
          })
        }),
        {
          OWNER_TELEGRAM_ID: '42',
          TELEGRAM_BOT_TOKEN: '12345:test',
          TELEGRAM_WEBHOOK_SECRET: 'webhook',
          APPROVAL_REPLAY_GUARD: makeReplayNamespace(),
          ...(configured === undefined ? {} : { STUDIO_URL: configured })
        }
      );
      assert.equal(response.status, 200);
      assert.equal(
        (await response.json()).studioUrl,
        configured ?? 'https://acceptance.test/studio/'
      );
    }
  } finally {
    KillSwitchGuidedNexaDevBot.prototype.handleUpdate = original;
  }
});
