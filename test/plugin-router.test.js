import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry } from '../src/core/plugin-registry.js';
import { ActionPolicy } from '../src/core/action-policy.js';
import { PluginRouter } from '../src/core/router.js';

function auditCollector() {
  const events = [];
  return { events, logger: { log: (event) => events.push(event) } };
}

test('PluginRouter dispatches the first matching READ command after policy evaluation', async () => {
  let executed = 0;
  const first = {
    manifest: { id: 'first', actions: {} },
    resolveCommand: () => null
  };
  const second = {
    manifest: {
      id: 'second',
      actions: { 'second.read': { risk: 'READ' } }
    },
    resolveCommand: (command) =>
      command === '/go'
        ? {
            actionId: 'second.read',
            execute: async () => {
              executed += 1;
              return { view: 'ok' };
            }
          }
        : null
  };
  const third = {
    manifest: {
      id: 'third',
      actions: { 'third.read': { risk: 'READ' } }
    },
    resolveCommand: () => ({
      actionId: 'third.read',
      execute: async () => {
        throw new Error('must not run');
      }
    })
  };
  const audit = auditCollector();
  const router = new PluginRouter({
    registry: new PluginRegistry([first, second, third]),
    policy: new ActionPolicy(),
    audit: audit.logger
  });

  const result = await router.dispatchCommand('/go', { isOwner: true });

  assert.deepEqual(result, { view: 'ok' });
  assert.equal(executed, 1);
  assert.equal(audit.events[0].event, 'action_attempt');
  assert.equal(audit.events[0].outcome, 'allowed');
  assert.equal(audit.events[1].event, 'action_result');
  assert.equal(audit.events[1].outcome, 'success');
});

test('PluginRouter dispatches callbacks through the same policy boundary', async () => {
  let executed = 0;
  const plugin = {
    manifest: {
      id: 'sample',
      actions: { 'sample.callback.read': { risk: 'READ' } }
    },
    resolveCallback: (data) =>
      data === 'sample:1'
        ? {
            actionId: 'sample.callback.read',
            execute: async () => {
              executed += 1;
              return { callback: 'ok' };
            }
          }
        : null
  };
  const router = new PluginRouter({
    registry: new PluginRegistry([plugin]),
    policy: new ActionPolicy(),
    audit: { log() {} }
  });

  assert.deepEqual(
    await router.dispatchCallback('sample:1', { isOwner: true }),
    { callback: 'ok' }
  );
  assert.equal(executed, 1);
});

test('PluginRouter returns null when no plugin owns the route', async () => {
  const plugin = {
    manifest: { id: 'sample', actions: {} },
    resolveCommand: () => null,
    resolveCallback: () => null
  };
  const router = new PluginRouter({
    registry: new PluginRegistry([plugin]),
    policy: new ActionPolicy(),
    audit: { log() {} }
  });

  assert.equal(
    await router.dispatchCommand('/unknown', { isOwner: true }),
    null
  );
  assert.equal(
    await router.dispatchCallback('unknown', { isOwner: true }),
    null
  );
});

test('PluginRouter denies undeclared actions without executing plugin code', async () => {
  let executed = 0;
  const plugin = {
    manifest: { id: 'sample', actions: {} },
    resolveCommand: () => ({
      actionId: 'sample.missing',
      execute: async () => {
        executed += 1;
      }
    })
  };
  const router = new PluginRouter({
    registry: new PluginRegistry([plugin]),
    policy: new ActionPolicy(),
    audit: { log() {} }
  });

  const result = await router.dispatchCommand('/go', { isOwner: true });

  assert.equal(result.denied, true);
  assert.equal(result.requiresApproval, false);
  assert.equal(result.reason, 'unknown_action');
  assert.equal(executed, 0);
});

test('PluginRouter never executes WRITE or DESTRUCTIVE actions before approval', async () => {
  for (const risk of ['WRITE', 'DESTRUCTIVE']) {
    let executed = 0;
    const actionId = `sample.${risk.toLowerCase()}`;
    const plugin = {
      manifest: {
        id: 'sample',
        actions: { [actionId]: { risk } }
      },
      resolveCommand: () => ({
        actionId,
        execute: async () => {
          executed += 1;
        }
      })
    };
    const router = new PluginRouter({
      registry: new PluginRegistry([plugin]),
      policy: new ActionPolicy(),
      audit: { log() {} }
    });

    const result = await router.dispatchCommand('/danger', { isOwner: true });

    assert.equal(result.requiresApproval, true);
    assert.equal(result.denied, false);
    assert.equal(result.risk, risk);
    assert.equal(executed, 0);
  }
});

test('PluginRouter executes an approved owner WRITE action exactly once', async () => {
  let executed = 0;
  const audit = auditCollector();
  const plugin = {
    manifest: {
      id: 'sample',
      actions: { 'sample.write': { risk: 'WRITE' } }
    },
    resolveCallback: (data) =>
      data === 'write:1'
        ? {
            actionId: 'sample.write',
            execute: async () => {
              executed += 1;
              return { ok: true, view: 'done' };
            }
          }
        : null
  };
  const router = new PluginRouter({
    registry: new PluginRegistry([plugin]),
    policy: new ActionPolicy(),
    audit: audit.logger
  });

  const result = await router.dispatchCallback('write:1', {
    isOwner: true,
    approved: true
  });

  assert.deepEqual(result, { ok: true, view: 'done' });
  assert.equal(executed, 1);
  assert.equal(audit.events[0].reason, 'owner_write_approved');
  assert.equal(audit.events[0].outcome, 'allowed');
  assert.equal(audit.events[1].event, 'action_result');
  assert.equal(audit.events[1].outcome, 'success');
  assert.equal(JSON.stringify(audit.events).includes('token'), false);
});
