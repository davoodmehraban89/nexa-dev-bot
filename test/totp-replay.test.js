import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { TotpVerifier } from '../src/core/totp.js';
import { makeReplayNamespace } from './helpers/replay-namespace.js';

// RFC 4226 secret and counters: 1 => 287082, 3 => 969429.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const CODE = '287082';

function makeHarness(namespace = makeReplayNamespace(), effects = []) {
  const bot = new NexaDevBot({
    APPROVAL_REPLAY_GUARD: namespace,
    APPROVAL_SIGNING_SECRET: 'signed-approval-test-secret',
    DESTRUCTIVE_TOTP_SECRET: SECRET
  });
  const audit = [];
  bot.audit.sink = (event) => audit.push(event);
  bot.router.dispatchCallback = async (data, context) => {
    if (context.approved) effects.push(data);
    return { text: 'executed', reply_markup: { inline_keyboard: [] } };
  };
  bot.telegram.answerCallbackQuery = async () => ({ ok: true });
  bot.telegram.editMessageText = async () => ({ ok: true });
  bot.telegram.sendMessage = async () => ({ ok: true });
  return { bot, namespace, effects, audit };
}

async function challenge(harness, prNumber = 1, ownerId = 123) {
  const token = await harness.bot.approvals.issue({
    pluginId: 'github',
    actionId: 'github.pull_request.merge',
    risk: 'DESTRUCTIVE',
    ownerId: String(ownerId),
    input: { repoId: 7, prNumber, headSha: 'a'.repeat(40) }
  });
  const result = await harness.bot.handleUpdate({
    callback_query: {
      id: `approve-${prNumber}-${ownerId}`,
      from: { id: ownerId },
      data: `approve:${token}`,
      message: { message_id: prNumber, chat: { id: ownerId } }
    }
  });
  assert.equal(result.secondFactorRequired, true);
  assert.equal(result.ok, true);
  return token;
}

function submit(harness, code = CODE, ownerId = 123) {
  return harness.bot.handleUpdate({
    message: {
      message_id: 100,
      chat: { id: ownerId },
      from: { id: ownerId },
      text: `/totp ${code}`
    }
  });
}

test('a used TOTP cannot authorize a second distinct signed destructive approval', async (t) => {
  t.mock.method(Date, 'now', () => 59_000);
  const harness = makeHarness();
  await challenge(harness, 1);
  assert.equal((await submit(harness)).secondFactorVerified, true);
  const secondToken = await challenge(harness, 2);

  const replay = await submit(harness);

  assert.equal(replay.ok, false);
  assert.equal(replay.secondFactorRejected, true);
  assert.match(replay.error, /already used|replay/i);
  assert.equal(harness.effects.length, 1);
  // Reusing the factor must not also consume the unused action approval.
  assert.equal(
    (await harness.bot.approvals.verify(secondToken, { ownerId: '123' })).input
      .prNumber,
    2
  );
});

test('concurrent distinct signed approvals have only one TOTP claim winner', async (t) => {
  t.mock.method(Date, 'now', () => 59_000);
  const namespace = makeReplayNamespace();
  const effects = [];
  const first = makeHarness(namespace, effects);
  const second = makeHarness(namespace, effects);
  let releaseFirst;
  let readFirst;
  const firstRead = new Promise((resolve) => {
    readFirst = resolve;
  });
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const getPending = first.bot.replayStore.getSecondFactorPending.bind(
    first.bot.replayStore
  );
  first.bot.replayStore.getSecondFactorPending = async (input) => {
    const pending = await getPending(input);
    readFirst();
    await firstGate;
    return pending;
  };
  await challenge(first, 1);
  const firstSubmission = submit(first);
  await firstRead;
  await challenge(second, 2);
  const secondSubmission = submit(second);
  releaseFirst();

  const results = await Promise.all([firstSubmission, secondSubmission]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => result.secondFactorRejected).length,
    1
  );
  assert.equal(effects.length, 1);
});

test('TOTP consumption survives bot and replay guard recreation', async (t) => {
  t.mock.method(Date, 'now', () => 59_000);
  const namespace = makeReplayNamespace();
  const effects = [];
  const first = makeHarness(namespace, effects);
  await challenge(first, 1);
  assert.equal((await submit(first)).ok, true);
  const recreated = makeHarness(namespace, effects);
  await challenge(recreated, 2);

  assert.equal((await submit(recreated)).secondFactorRejected, true);
  assert.equal(effects.length, 1);
});

test('TOTP claim persists until the final acceptance boundary and stores no raw code', async (t) => {
  let now = 59_000;
  t.mock.method(Date, 'now', () => now);
  const harness = makeHarness();
  await challenge(harness, 1);
  assert.equal((await submit(harness)).ok, true);
  const stepClaims = [...harness.namespace.states.values()].filter(
    (state) => state.data.get('used') === 90_000
  );
  assert.equal(stepClaims.length, 1);
  assert.equal(stepClaims[0].alarm, 90_000);

  now = 89_999;
  await challenge(harness, 2);
  assert.equal((await submit(harness)).secondFactorRejected, true);
  now = 90_000;
  await challenge(harness, 3);
  const expired = await submit(harness);
  assert.equal(expired.secondFactorRejected, true);
  assert.match(expired.error, /invalid totp/i);
  assert.equal((await submit(harness, '969429')).ok, true);
  assert.equal(harness.effects.length, 2);

  const persisted = JSON.stringify(
    [...harness.namespace.states].map(([id, state]) => [id, [...state.data]])
  );
  assert.equal(persisted.includes(CODE), false);
  assert.equal(persisted.includes(SECRET), false);
  assert.equal(JSON.stringify(harness.audit).includes(CODE), false);
});

test('TOTP claim storage outage rejects before consuming the approval or executing', async (t) => {
  t.mock.method(Date, 'now', () => 59_000);
  const namespace = makeReplayNamespace();
  const harness = makeHarness(namespace);
  const token = await challenge(harness, 1);
  const get = namespace.get.bind(namespace);
  namespace.get = (id) => {
    const stub = get(id);
    return {
      async fetch(request) {
        if (String(id).includes(':second-factor-step:')) {
          return Response.json({ accepted: false }, { status: 503 });
        }
        return stub.fetch(request);
      }
    };
  };

  const result = await submit(harness);

  assert.equal(result.ok, false);
  assert.equal(result.secondFactorRejected, true);
  assert.equal(harness.effects.length, 0);
  assert.equal(
    (await harness.bot.approvals.verify(token, { ownerId: '123' })).input
      .prNumber,
    1
  );
});

test('invalid pending Approval cannot burn an otherwise unused TOTP step', async (t) => {
  t.mock.method(Date, 'now', () => 59_000);
  const harness = makeHarness();
  await harness.bot.replayStore.setSecondFactorPending({
    ownerId: '123',
    token: 'invalid-approval-signature',
    expiresAt: 179_000
  });
  assert.equal((await submit(harness)).secondFactorRejected, true);
  await challenge(harness, 1);

  assert.equal((await submit(harness)).secondFactorVerified, true);
  assert.equal(harness.effects.length, 1);
});

test('TOTP consumption is scoped to its owner', async (t) => {
  t.mock.method(Date, 'now', () => 59_000);
  const harness = makeHarness();
  await challenge(harness, 1, 123);
  assert.equal((await submit(harness, CODE, 123)).ok, true);
  await challenge(harness, 2, 456);

  assert.equal((await submit(harness, CODE, 456)).ok, true);
  assert.equal(harness.effects.length, 2);
});

test('boolean TOTP verification retains the configured window boundaries', async () => {
  let now = 0;
  const verifier = new TotpVerifier({ secret: SECRET, now: () => now });
  for (const [time, accepted] of [
    [0, true],
    [59_999, true],
    [60_000, true],
    [89_999, true],
    [90_000, false]
  ]) {
    now = time;
    assert.equal(await verifier.verify(CODE), accepted, `time ${time}`);
  }
  assert.equal(await verifier.verify('not-an-otp'), false);
});
