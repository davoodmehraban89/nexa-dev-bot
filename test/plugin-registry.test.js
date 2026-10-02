import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry } from '../src/core/plugin-registry.js';

const plugin = (id, actions = {}) => ({
  manifest: { id, name: id, version: 1, actions }
});

test('PluginRegistry registers valid plugins and exposes lookups', () => {
  const github = plugin('github', {
    'github.repos.list': { risk: 'READ' }
  });

  const registry = new PluginRegistry([github]);

  assert.deepEqual(registry.getPlugins(), [github]);
  assert.equal(registry.getPlugin('github'), github);
  assert.deepEqual(registry.getAction('github.repos.list'), {
    pluginId: 'github',
    actionId: 'github.repos.list',
    risk: 'READ'
  });
});

test('PluginRegistry rejects duplicate plugin ids', () => {
  assert.throws(
    () => new PluginRegistry([plugin('github'), plugin('github')]),
    /duplicate plugin id/i
  );
});

test('PluginRegistry rejects duplicate action ids across plugins', () => {
  assert.throws(
    () => new PluginRegistry([
      plugin('github', { 'shared.read': { risk: 'READ' } }),
      plugin('cloudflare', { 'shared.read': { risk: 'READ' } })
    ]),
    /duplicate action id/i
  );
});

test('PluginRegistry rejects unknown action risk levels', () => {
  assert.throws(
    () => new PluginRegistry([
      plugin('github', { 'github.repos.list': { risk: 'SUPERUSER' } })
    ]),
    /invalid action risk/i
  );
});
