import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomationRunner } from '../src/core/automation-runner.js';
import { DurableAutomationStoreClient } from '../src/core/automation-store.js';
import { createAutomation } from '../src/core/automation.js';
import { ActionPolicy } from '../src/core/action-policy.js';
import { PluginRouter } from '../src/core/router.js';
import { KillSwitch } from '../src/core/kill-switch.js';
import { AutomationStore } from '../src/durable/automation-store.js';
import { IncidentStore } from '../src/durable/incident-store.js';
import { makeReplayState } from './helpers/replay-namespace.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

function automationNamespace() {
  const states = new Map();
  return {
    states,
    idFromName: (name) => name,
    get(id) {
      if (!states.has(id)) states.set(id, makeReplayState());
      return {
        fetch: (url, options) =>
          new AutomationStore(states.get(id)).fetch(new Request(url, options))
      };
    }
  };
}

function routerFor(execute, { risk = 'READ', killSwitch = null } = {}) {
  return new PluginRouter({
    registry: {
      getPlugins: () => [
        {
          manifest: { id: 'test' },
          resolveCallback: async () => ({ actionId: 'test.run', execute })
        }
      ],
      getAction: () => ({ pluginId: 'test', actionId: 'test.run', risk })
    },
    policy: new ActionPolicy(),
    audit: { log() {} },
    killSwitch
  });
}

async function automationFixture(execute, options = {}) {
  const namespace = automationNamespace();
  const store = new DurableAutomationStoreClient({ namespace, ownerId: 'o' });
  const state = await store.put(
    createAutomation({
      id: 'run',
      ownerId: 'o',
      recipe: 'test',
      steps: [
        { key: 'first', callback: 'read:first' },
        { key: 'second', callback: 'read:second' }
      ]
    })
  );
  const router = routerFor(execute, options);
  return {
    namespace,
    store,
    state,
    runner: new AutomationRunner({
      router,
      store,
      killSwitch: options.killSwitch
    })
  };
}

test('concurrent automation advances reserve the step before real router effects', async () => {
  const entered = deferred();
  const release = deferred();
  let effects = 0;
  const { runner, store, state } = await automationFixture(async () => {
    effects++;
    if (effects === 1) {
      entered.resolve();
      await release.promise;
    }
    return { ok: true };
  });
  const first = runner.advance(state);
  await entered.promise;
  try {
    const duplicate = await runner.advance(structuredClone(state));
    assert.equal(effects, 1);
    assert.equal(duplicate.status, 'step_unresolved');
  } finally {
    release.resolve();
    await first;
  }
  assert.equal((await store.get('run')).cursor, 1);
});

test('an old automation cursor cannot run a completed step or the next step', async () => {
  let effects = 0;
  const { runner, store, state } = await automationFixture(async () => {
    effects++;
    return { ok: true };
  });
  await runner.advance(state);
  const stale = await runner.advance(state);
  assert.equal(effects, 1);
  assert.equal(stale.cursor, 1);
  assert.equal((await store.get('run')).cursor, 1);
});

for (const status of [
  'cancelled',
  'failed',
  'completed',
  'awaiting_approval'
]) {
  test(`durable ${status} automation rejects a caller's stale ready snapshot`, async () => {
    let effects = 0;
    const { runner, store, state } = await automationFixture(async () => {
      effects++;
      return { ok: true };
    });
    await store.put({ ...state, status });
    const result = await runner.advance(state);
    assert.equal(effects, 0);
    assert.equal(result.status, status);
    assert.equal((await store.get('run')).status, status);
  });
}

test('automation fails closed when persistent step claims are unavailable', async () => {
  let effects = 0;
  const runner = new AutomationRunner({
    store: { put: async (state) => state },
    router: routerFor(async () => {
      effects++;
      return { ok: true };
    })
  });
  await assert.rejects(
    runner.advance(
      createAutomation({
        id: 'run',
        ownerId: 'o',
        steps: [{ key: 'first', callback: 'read:first' }]
      })
    ),
    /claim/i
  );
  assert.equal(effects, 0);
});

test('an ambiguous automation provider failure remains unresolved across retries and eviction', async () => {
  let effects = 0;
  const { runner, store, state } = await automationFixture(async () => {
    effects++;
    throw new Error('provider result unknown');
  });
  await assert.rejects(runner.advance(state), /provider result unknown/);
  const durable = await store.get('run');
  assert.equal(durable.status, 'step_unresolved');
  assert.equal(durable.stepClaim.key, 'first');
  await runner.advance(state);
  await runner.advance(durable);
  assert.equal(effects, 1);
  assert.equal((await store.get('run')).cursor, 0);
});

test('durable claims cannot be overwritten by stale PUT or completed with another token', async () => {
  const { store, state } = await automationFixture(async () => ({ ok: true }));
  const claim = await store.claimStep(state);
  assert.equal(claim.claimed, true);
  await assert.rejects(store.put(state), /write|conflict/i);
  await assert.rejects(
    store.put({ ...claim.state, status: 'cancelled' }),
    /write|conflict/i
  );
  const forged = await store.completeStep('run', {
    token: 'another-claim',
    outcome: 'complete'
  });
  assert.equal(forged.completed, false);
  assert.equal((await store.get('run')).status, 'step_unresolved');
  const completed = await store.completeStep('run', {
    token: claim.token,
    outcome: 'complete'
  });
  assert.equal(completed.completed, true);
  assert.equal(completed.state.cursor, 1);
  const replay = await store.completeStep('run', {
    token: claim.token,
    outcome: 'complete'
  });
  assert.equal(replay.completed, false);
  assert.equal(replay.state.cursor, 1);
});

test('automation claims retain real router approval and kill-switch checks', async () => {
  let effects = 0;
  const needsApproval = await automationFixture(
    async () => {
      effects++;
    },
    { risk: 'WRITE' }
  );
  const approval = await needsApproval.runner.advance(needsApproval.state);
  assert.equal(approval.status, 'awaiting_approval');
  assert.equal(approval.approvalIntent.key, 'first');
  assert.equal(effects, 0);

  const killSwitch = new KillSwitch({
    store: { get: async () => ({ mode: 'LOCKED' }) }
  });
  const blocked = await automationFixture(
    async () => {
      effects++;
    },
    { killSwitch }
  );
  assert.equal(
    (await blocked.runner.advance(blocked.state)).status,
    'paused_kill_switch'
  );
  assert.equal(effects, 0);
});

function incidentRequest(path, owner, body) {
  return new Request(`https://incident.local${path}?owner=${owner}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}

const incident = (repo) => ({
  provider: 'github',
  repo,
  sha: 'abc',
  kind: 'ci'
});

test('concurrent incident upserts preserve distinct incidents and owner isolation', async () => {
  const durable = makeReplayState();
  const fetch = (request) => new IncidentStore(durable).fetch(request);
  await Promise.all([
    fetch(incidentRequest('/upsert', 'o', incident('a'))),
    fetch(incidentRequest('/upsert', 'o', incident('b'))),
    fetch(incidentRequest('/upsert', 'other', incident('c')))
  ]);
  const result = await (await fetch(incidentRequest('/', 'o'))).json();
  assert.deepEqual(result.items.map((item) => item.repo).sort(), ['a', 'b']);
  const other = await (await fetch(incidentRequest('/', 'other'))).json();
  assert.deepEqual(
    other.items.map((item) => item.repo),
    ['c']
  );
});

test('concurrent duplicate incident evidence increments one durable incident', async () => {
  const durable = makeReplayState();
  const fetch = (request) => new IncidentStore(durable).fetch(request);
  await Promise.all([
    fetch(incidentRequest('/upsert', 'o', incident('a'))),
    fetch(incidentRequest('/upsert', 'o', incident('a')))
  ]);
  const result = await (await fetch(incidentRequest('/', 'o'))).json();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].count, 2);
});

test('an incident resolve waiting for its body cannot erase a concurrent upsert', async () => {
  const durable = makeReplayState();
  const fetch = (request) => new IncidentStore(durable).fetch(request);
  const original = await (
    await fetch(incidentRequest('/upsert', 'o', incident('a')))
  ).json();
  const bodyEntered = deferred();
  const bodyRelease = deferred();
  const resolving = fetch({
    url: 'https://incident.local/resolve?owner=o',
    method: 'POST',
    async json() {
      bodyEntered.resolve();
      await bodyRelease.promise;
      return { id: original.id };
    }
  });
  await bodyEntered.promise;
  await fetch(incidentRequest('/upsert', 'o', incident('b')));
  bodyRelease.resolve();
  assert.equal((await resolving).status, 200);
  const result = await (await fetch(incidentRequest('/', 'o'))).json();
  assert.equal(result.items.length, 2);
  assert.equal(
    result.items.find((item) => item.id === original.id).status,
    'resolved'
  );
});
