import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { ApprovalReplayGuard } from '../src/durable/approval-replay-guard.js';
import { KillSwitchGuidedNexaDevBot } from '../src/kill-switch-bot.js';
import {
  makeReplayNamespace,
  makeReplayState
} from './helpers/replay-namespace.js';

let module = {};
try {
  module = await import('../src/core/telegram-update-guard.js');
} catch {}
const consume = (input) => {
  assert.equal(
    typeof module.consumeTelegramUpdate,
    'function',
    'durable Telegram update claims must exist'
  );
  return module.consumeTelegramUpdate(input);
};
const identity = (token) => {
  assert.equal(
    typeof module.telegramBotIdentity,
    'function',
    'bot identity derivation must exist'
  );
  return module.telegramBotIdentity(token);
};
const DAY = 86_400_000;
const fixedTime = 1_800_000_000_000;
const ownerUpdate = (updateId = 7) => ({
  update_id: updateId,
  message: {
    message_id: 4,
    from: { id: 123 },
    chat: { id: 123 },
    text: '/help'
  }
});
const webhook = (update) =>
  new Request('https://example.test/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'right'
    },
    body: typeof update === 'string' ? update : JSON.stringify(update)
  });
const env = (namespace = makeReplayNamespace()) => ({
  TELEGRAM_WEBHOOK_SECRET: 'right',
  OWNER_TELEGRAM_ID: '123',
  TELEGRAM_BOT_TOKEN: '12345:test-secret',
  APPROVAL_REPLAY_GUARD: namespace
});

test('durable claims reject duplicates across object recreation without storing update content', async () => {
  const namespace = makeReplayNamespace();
  assert.equal(await consume({ namespace, botId: '12345', updateId: 0 }), true);
  assert.equal(
    await consume({ namespace, botId: '12345', updateId: 0 }),
    false
  );
  const [key, state] = [...namespace.states][0];
  assert.equal(key, 'telegram-webhook:v1:12345:0');
  assert.equal(state.data.size, 1);
  assert.ok(
    [...state.data.values()].every((value) => typeof value === 'number')
  );
});

test('claims expire exactly after 24 hours even when the cleanup alarm is delayed', async () => {
  const previousNow = Date.now;
  let current = fixedTime;
  Date.now = () => current;
  try {
    const namespace = makeReplayNamespace();
    const claim = () =>
      consume({ namespace, botId: '12345', updateId: 9, now: Date.now });
    assert.equal(await claim(), true);
    const state = [...namespace.states.values()][0];
    assert.equal(state.alarm, fixedTime + DAY);
    current += DAY - 1;
    assert.equal(await claim(), false);
    assert.equal(
      state.alarm,
      fixedTime + DAY,
      'a duplicate must not extend retention'
    );
    current += 1;
    assert.equal(await claim(), true);
    assert.equal(state.alarm, fixedTime + 2 * DAY);
    await new ApprovalReplayGuard(state).alarm();
    assert.equal(
      await claim(),
      false,
      'a delayed old alarm must not delete a renewed claim'
    );
    current += DAY;
    await new ApprovalReplayGuard(state).alarm();
    assert.equal(state.data.size, 0);
    assert.equal(state.alarm, null);
  } finally {
    Date.now = previousNow;
  }
});

test('concurrent deliveries have one durable claim winner', async () => {
  const namespace = makeReplayNamespace();
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      consume({ namespace, botId: '12345', updateId: 8 })
    )
  );
  assert.equal(results.filter(Boolean).length, 1);
});

test('different bots and approval nonces do not share webhook claims', async () => {
  const namespace = makeReplayNamespace();
  for (const botId of ['12345', '67890'])
    assert.equal(await consume({ namespace, botId, updateId: 7 }), true);
  const approval = await namespace.get(namespace.idFromName('12345:7')).fetch(
    new Request('https://approval-replay/consume', {
      method: 'POST',
      body: JSON.stringify({ expiresAt: Date.now() + 60_000 })
    })
  );
  assert.equal(approval.status, 200);
});

test('invalid update ids cannot allocate durable objects', async () => {
  assert.equal(typeof module.consumeTelegramUpdate, 'function');
  let calls = 0;
  const namespace = {
    idFromName() {
      calls++;
    },
    get() {
      calls++;
    }
  };
  for (const updateId of [
    undefined,
    null,
    '1',
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    await assert.rejects(
      async () => consume({ namespace, botId: '12345', updateId }),
      /update|integer/i
    );
  }
  assert.equal(calls, 0);
});

test('guard configuration and unexpected replies fail closed', async () => {
  await assert.rejects(
    async () => consume({ botId: '12345', updateId: 1 }),
    /configured/i
  );
  for (const response of [
    Response.json({}),
    Response.json({ accepted: true }, { status: 500 }),
    Response.json({ accepted: false }, { status: 409 })
  ]) {
    const namespace = {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => response })
    };
    await assert.rejects(
      async () => consume({ namespace, botId: '12345', updateId: 1 }),
      /guard|claim/i
    );
  }
});

test('bot identities survive token rotation and nonstandard tokens are hashed', async () => {
  assert.equal(await identity('12345:old-secret'), '12345');
  assert.equal(await identity('12345:new-secret'), '12345');
  const hashed = await identity('nonstandard-test-secret');
  assert.match(hashed, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await identity('nonstandard-test-secret'), hashed);
  assert.notEqual(await identity('another-test-secret'), hashed);
  assert.doesNotMatch(hashed, /nonstandard|test-secret/);
});

test('claim expiry and cleanup alarm roll back together when alarm scheduling fails', async () => {
  assert.equal(typeof module.consumeTelegramUpdate, 'function');
  const state = makeReplayState({ failAlarm: true });
  const namespace = {
    idFromName: (name) => name,
    get: () => ({
      fetch: (request) => new ApprovalReplayGuard(state).fetch(request)
    })
  };
  await assert.rejects(async () =>
    consume({ namespace, botId: '12345', updateId: 1 })
  );
  assert.equal(state.data.size, 0);
});

test('webhook duplicate and concurrent deliveries produce only one bot response', async () => {
  const originalFetch = globalThis.fetch;
  let effects = 0;
  globalThis.fetch = async () => {
    effects++;
    return Response.json({ ok: true, result: { message_id: 9 } });
  };
  try {
    const runtime = env();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        worker.fetch(webhook(ownerUpdate()), runtime)
      )
    );
    assert.ok(responses.every((response) => response.status === 200));
    const bodies = await Promise.all(
      responses.map((response) => response.json())
    );
    assert.equal(effects, 1);
    assert.equal(bodies.filter((body) => body.duplicate === true).length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('webhook rejects malformed JSON and invalid update ids before side effects', async () => {
  const originalFetch = globalThis.fetch;
  let effects = 0;
  globalThis.fetch = async () => {
    effects++;
    throw new Error('must not execute');
  };
  try {
    for (const update of [
      '{',
      { ...ownerUpdate(), update_id: undefined },
      ownerUpdate('7'),
      ownerUpdate(-1)
    ]) {
      assert.equal((await worker.fetch(webhook(update), env())).status, 400);
    }
    assert.equal(effects, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('owner updates fail closed if the durable guard is absent or unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let effects = 0;
  globalThis.fetch = async () => {
    effects++;
    return Response.json({ ok: true });
  };
  console.error = () => {};
  try {
    for (const namespace of [
      null,
      {
        idFromName: (name) => name,
        get: () => ({
          fetch: async () => {
            throw new Error('private provider text');
          }
        })
      }
    ]) {
      assert.equal(
        (await worker.fetch(webhook(ownerUpdate()), env(namespace))).status,
        503
      );
    }
    assert.equal(effects, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test('nonowner updates do not claim durable keys or execute the bot', async () => {
  let claims = 0;
  const namespace = {
    idFromName() {
      claims++;
      throw new Error('must not claim');
    },
    get() {
      claims++;
    }
  };
  const update = ownerUpdate();
  update.message.from.id = 999;
  const response = await worker.fetch(webhook(update), env(namespace));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
  assert.equal(claims, 0);
});

test('claimed handler failures acknowledge once and log only fixed metadata', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  let effects = 0;
  const privateText =
    'private draft github_pat_unconfigured-token upstream error';
  globalThis.fetch = async () => {
    effects++;
    throw new Error(privateText);
  };
  console.error = (...values) => logs.push(values.map(String).join(' '));
  try {
    const runtime = env();
    const response = await worker.fetch(webhook(ownerUpdate()), runtime);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: false,
      processed_error: true,
      error: 'Telegram webhook processing failed'
    });
    const retry = await worker.fetch(webhook(ownerUpdate()), runtime);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).duplicate, true);
    assert.equal(effects, 1);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /telegram_webhook_error/);
    assert.doesNotMatch(logs.join('\n'), /private|github_pat_|upstream|draft/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test('handled bot failures cannot return provider or source text from the webhook', async () => {
  const originalHandleUpdate =
    KillSwitchGuidedNexaDevBot.prototype.handleUpdate;
  const originalError = console.error;
  const logs = [];
  KillSwitchGuidedNexaDevBot.prototype.handleUpdate = async () => ({
    ok: false,
    error: 'private draft provider error'
  });
  console.error = (...values) => logs.push(values.map(String).join(' '));
  try {
    const response = await worker.fetch(webhook(ownerUpdate()), env());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: false,
      processed_error: true,
      error: 'Telegram webhook processing failed'
    });
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs.join('\n'), /private|draft|provider/);
  } finally {
    KillSwitchGuidedNexaDevBot.prototype.handleUpdate = originalHandleUpdate;
    console.error = originalError;
  }
});
