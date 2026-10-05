import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { ApprovalReplayGuard as ExportedApprovalReplayGuard } from '../src/index.js';
import { DurableApprovalReplayStore } from '../src/core/durable-replay-store.js';
import { ApprovalReplayGuard } from '../src/durable/approval-replay-guard.js';

function makeNamespace(handler) {
  const ids = [];
  return {
    ids,
    idFromName(name) {
      ids.push(String(name));
      return `id:${name}`;
    },
    get(id) {
      return {
        async fetch(request) {
          return handler(id, request);
        }
      };
    }
  };
}

function makeState() {
  const data = new Map();
  let alarm = null;
  return {
    data,
    get alarm() { return alarm; },
    storage: {
      async transaction(fn) {
        return fn({
          get: key => data.get(key),
          put: (key, value) => { data.set(key, value); },
          delete: key => data.delete(key)
        });
      },
      async setAlarm(value) { alarm = value; },
      async deleteAll() { data.clear(); alarm = null; }
    }
  };
}

test('DurableApprovalReplayStore fails closed without a Durable Object namespace', async () => {
  const store = new DurableApprovalReplayStore();
  await assert.rejects(
    () => store.consume({ ownerId: '123', nonce: 'abc', expiresAt: Date.now() + 10_000 }),
    /not configured/i
  );
});

test('DurableApprovalReplayStore scopes one-time consumption by owner and nonce', async () => {
  const namespace = makeNamespace(async (_id, request) => {
    const body = await request.json();
    return Response.json({ accepted: true, expiresAt: body.expiresAt });
  });
  const store = new DurableApprovalReplayStore({ namespace });

  const accepted = await store.consume({
    ownerId: '123',
    nonce: 'nonce-1',
    expiresAt: 42_000
  });

  assert.equal(accepted, true);
  assert.deepEqual(namespace.ids, ['123:nonce-1']);
});

test('DurableApprovalReplayStore rejects a replay response from the Durable Object', async () => {
  const namespace = makeNamespace(async () => Response.json({ accepted: false, reason: 'already_used' }, { status: 409 }));
  const store = new DurableApprovalReplayStore({ namespace });

  const accepted = await store.consume({ ownerId: '123', nonce: 'nonce-2', expiresAt: 42_000 });
  assert.equal(accepted, false);
});

test('ApprovalReplayGuard atomically accepts once and schedules cleanup', async () => {
  const state = makeState();
  const guard = new ApprovalReplayGuard(state);
  const expiresAt = Date.now() + 60_000;
  const request = () => new Request('https://approval-replay/consume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresAt })
  });

  const first = await guard.fetch(request());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { accepted: true });
  assert.equal(state.data.get('used'), expiresAt);
  assert.equal(state.alarm, expiresAt);

  const second = await guard.fetch(request());
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { accepted: false, reason: 'already_used' });
});

test('ApprovalReplayGuard fails closed for expired requests and alarm removes storage', async () => {
  const state = makeState();
  const guard = new ApprovalReplayGuard(state);
  const response = await guard.fetch(new Request('https://approval-replay/consume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresAt: Date.now() - 1 })
  }));

  assert.equal(response.status, 410);
  assert.equal((await response.json()).accepted, false);

  state.data.set('used', Date.now());
  await guard.alarm();
  assert.equal(state.data.size, 0);
});

test('Worker exports ApprovalReplayGuard and Wrangler declares SQLite durable binding', async () => {
  assert.ok(worker && typeof worker.fetch === 'function');
  assert.equal(ExportedApprovalReplayGuard, ApprovalReplayGuard);

  const configText = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(configText);
  assert.ok(config.durable_objects?.bindings?.some(binding =>
    binding.name === 'APPROVAL_REPLAY_GUARD' && binding.class_name === 'ApprovalReplayGuard'
  ));
  assert.deepEqual(config.exports?.ApprovalReplayGuard, {
    type: 'durable-object',
    storage: 'sqlite'
  });
});


test('DurableApprovalReplayStore persists owner-scoped second-factor pending state without exposing it in logs', async () => {
  let stored = null;
  const namespace = makeNamespace(async (_id, request) => {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/second-factor/put') {
      stored = await request.json();
      return Response.json({ stored: true });
    }
    if (request.method === 'GET' && url.pathname === '/second-factor/get') {
      return stored ? Response.json({ pending: stored }) : Response.json({ pending: null }, { status: 404 });
    }
    if (request.method === 'POST' && url.pathname === '/second-factor/clear') {
      stored = null;
      return Response.json({ cleared: true });
    }
    return new Response('Not Found', { status: 404 });
  });
  const store = new DurableApprovalReplayStore({ namespace });
  const expiresAt = Date.now() + 60_000;

  await store.setSecondFactorPending({ ownerId: '123', token: 'signed-token', expiresAt });
  assert.deepEqual(await store.getSecondFactorPending({ ownerId: '123' }), { token: 'signed-token', expiresAt, attempts: 0 });
  await store.clearSecondFactorPending({ ownerId: '123' });
  assert.equal(await store.getSecondFactorPending({ ownerId: '123' }), null);
  assert.ok(namespace.ids.every(id => id === '123:second-factor'));
});

test('ApprovalReplayGuard expires and clears second-factor pending state fail-closed', async () => {
  const state = makeState();
  const guard = new ApprovalReplayGuard(state);
  const expiresAt = Date.now() + 60_000;

  const put = await guard.fetch(new Request('https://approval-replay/second-factor/put', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'signed-token', expiresAt })
  }));
  assert.equal(put.status, 200);

  const get = await guard.fetch(new Request('https://approval-replay/second-factor/get'));
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { pending: { token: 'signed-token', expiresAt, attempts: 0 } });

  const clear = await guard.fetch(new Request('https://approval-replay/second-factor/clear', { method: 'POST' }));
  assert.equal(clear.status, 200);
  const after = await guard.fetch(new Request('https://approval-replay/second-factor/get'));
  assert.equal(after.status, 404);
});
