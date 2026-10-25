import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeReplayNamespace } from './helpers/replay-namespace.js';

const secret = 'github_pat_WEBHOOK_ONLY_SENTINEL_3021';
const request = (update) =>
  new Request('https://acceptance.test/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'webhook' },
    body: JSON.stringify(update)
  });
const environment = (namespace) => ({
  OWNER_TELEGRAM_ID: '42',
  TELEGRAM_BOT_TOKEN: '12345:test',
  TELEGRAM_WEBHOOK_SECRET: 'webhook',
  APPROVAL_REPLAY_GUARD: namespace,
  WORKSPACE_STORE: {
    idFromName: () => {
      throw new Error('must not read pending input');
    },
    get: () => {}
  }
});

test('new and edited token messages are deleted once with no source in replies, logs or durable state', async () => {
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  const previousError = console.error;
  const outbound = [];
  const logs = [];
  globalThis.fetch = async (url, options) => {
    outbound.push({
      method: new URL(url).pathname.split('/').pop(),
      body: JSON.parse(options.body)
    });
    return Response.json({ ok: true, result: true });
  };
  console.log = console.error = (...args) =>
    logs.push(args.map(String).join(' '));
  try {
    const namespace = makeReplayNamespace();
    const env = environment(namespace);
    for (const [index, kind] of ['message', 'edited_message'].entries()) {
      const update = {
        update_id: index + 1,
        [kind]: {
          message_id: 20 + index,
          chat: { id: 42 },
          from: { id: 42 },
          text: secret
        }
      };
      const response = await worker.fetch(request(update), env);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).secretRejected, true, kind);
      const duplicate = await worker.fetch(request(update), env);
      assert.equal((await duplicate.json()).duplicate, true);
    }
    assert.deepEqual(
      outbound.map((call) => call.method),
      ['deleteMessage', 'sendMessage', 'deleteMessage', 'sendMessage']
    );
    assert.doesNotMatch(JSON.stringify({ outbound, logs }), new RegExp(secret));
    const state = [...namespace.states.values()].map((item) => [...item.data]);
    assert.doesNotMatch(JSON.stringify(state), new RegExp(secret));
    assert.ok(
      state.every((rows) =>
        rows.every(([, value]) => typeof value === 'number')
      )
    );
  } finally {
    globalThis.fetch = previousFetch;
    console.log = previousLog;
    console.error = previousError;
  }
});

test('edited nonowner token updates cannot allocate a claim or contact Telegram', async () => {
  const namespace = makeReplayNamespace();
  const response = await worker.fetch(
    request({
      update_id: 9,
      edited_message: {
        message_id: 22,
        chat: { id: 7 },
        from: { id: 7 },
        text: secret
      }
    }),
    environment(namespace)
  );
  assert.equal((await response.json()).ignored, true);
  assert.equal(namespace.states.size, 0);
});
