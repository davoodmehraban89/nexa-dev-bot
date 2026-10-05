import test from 'node:test';
import assert from 'node:assert/strict';
import { KillSwitch } from '../src/core/kill-switch.js';
import { PluginRouter } from '../src/core/router.js';
import { AutomationRunner } from '../src/core/automation-runner.js';

function registryFor(risk, execute) {
  const plugin = {
    manifest: { id: 'test' },
    async resolveCallback() { return { actionId: `test.${risk.toLowerCase()}`, execute }; }
  };
  return {
    getPlugins: () => [plugin],
    getAction: () => ({ id: `test.${risk.toLowerCase()}`, risk })
  };
}

const audit = { log() {} };
const policy = { evaluate: ({ action }) => ({ allowed: true, requiresApproval: false, risk: action.risk }) };

test('LOCKED kill switch allows READ but blocks WRITE before provider mutation', async () => {
  let reads = 0;
  let writes = 0;
  const killSwitch = new KillSwitch({ store: { get: async () => ({ mode: 'LOCKED' }) } });

  const readRouter = new PluginRouter({ registry: registryFor('READ', async () => { reads++; return { ok: true }; }), policy, audit, killSwitch });
  const writeRouter = new PluginRouter({ registry: registryFor('WRITE', async () => { writes++; return { ok: true }; }), policy, audit, killSwitch });

  assert.equal((await readRouter.dispatchCallback('x', { isOwner: true })).ok, true);
  const blocked = await writeRouter.dispatchCallback('x', { isOwner: true, approved: true });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.killSwitchLocked, true);
  assert.equal(reads, 1);
  assert.equal(writes, 0, 'provider mutation must never run while locked');
});

test('kill switch fails closed for WRITE when durable state cannot be read', async () => {
  let writes = 0;
  const killSwitch = new KillSwitch({ store: { get: async () => { throw new Error('durable unavailable'); } } });
  const router = new PluginRouter({ registry: registryFor('WRITE', async () => { writes++; return { ok: true }; }), policy, audit, killSwitch });
  const blocked = await router.dispatchCallback('x', { isOwner: true, approved: true });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.killSwitchLocked, true);
  assert.equal(writes, 0);
});

test('LOCKED kill switch blocks automation advance before routing any step', async () => {
  let routed = 0;
  const runner = new AutomationRunner({
    router: { dispatchCallback: async () => { routed++; return { ok: true }; } },
    store: { put: async state => state },
    killSwitch: new KillSwitch({ store: { get: async () => ({ mode: 'LOCKED' }) } })
  });
  const state = { status: 'ready', cursor: 0, ownerId: '123', steps: [{ callback: 'write:x', key: 'k1' }] };
  const blocked = await runner.advance(state);
  assert.equal(blocked.status, 'paused_kill_switch');
  assert.equal(routed, 0);
});

test('only owner-approved control can change lock state and unlock is sensitive', async () => {
  const calls = [];
  const store = {
    get: async () => ({ mode: 'NORMAL' }),
    set: async next => { calls.push(next); return next; }
  };
  const killSwitch = new KillSwitch({ store });
  await assert.rejects(() => killSwitch.lock({ isOwner: false, approved: true }), /owner/i);
  await assert.rejects(() => killSwitch.lock({ isOwner: true, approved: false }), /approval/i);
  await killSwitch.lock({ isOwner: true, approved: true });
  await assert.rejects(() => killSwitch.unlock({ isOwner: true, approved: false }), /approval/i);
  await killSwitch.unlock({ isOwner: true, approved: true });
  assert.deepEqual(calls.map(x => x.mode), ['LOCKED', 'NORMAL']);
});
