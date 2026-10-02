import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry } from '../src/core/plugin-registry.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';

function makeMenu() {
  const calls = [];
  const reposView = { text: 'repos', reply_markup: { inline_keyboard: [] } };
  return {
    calls,
    reposView,
    async getReposListView() {
      calls.push('/repos');
      return reposView;
    },
    async renderByCallback(data) {
      calls.push(data);
      return { text: data, reply_markup: { inline_keyboard: [] } };
    }
  };
}

test('GitHub plugin manifest registers all Foundation v1 actions as READ', () => {
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github: {}, menu });
  const registry = new PluginRegistry([plugin]);

  const expected = [
    'github.repos.list',
    'github.repo.detail',
    'github.files.list',
    'github.tree.read',
    'github.blob.read',
    'github.pr.list',
    'github.commits.list',
    'github.status.read'
  ];

  for (const actionId of expected) {
    assert.equal(registry.getAction(actionId)?.risk, 'READ');
  }
});

test('GitHub plugin resolves /repos without executing the menu before policy', async () => {
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github: {}, menu });

  const route = plugin.resolveCommand('/repos');

  assert.equal(route.actionId, 'github.repos.list');
  assert.deepEqual(menu.calls, []);
  assert.equal(await route.execute(), menu.reposView);
  assert.deepEqual(menu.calls, ['/repos']);
  assert.equal(plugin.resolveCommand('/status'), null);
});

test('GitHub plugin maps existing GitHub callback families to declared actions', async () => {
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github: {}, menu });
  const cases = [
    ['menu:repos', 'github.repos.list'],
    ['repo:123', 'github.repo.detail'],
    ['files:123', 'github.files.list'],
    ['tree:123:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'github.tree.read'],
    ['blob:123:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'github.blob.read'],
    ['pr:123', 'github.pr.list'],
    ['commits:123', 'github.commits.list'],
    ['status:123', 'github.status.read']
  ];

  for (const [callbackData, actionId] of cases) {
    const route = plugin.resolveCallback(callbackData);
    assert.equal(route.actionId, actionId);
    const before = menu.calls.length;
    const view = await route.execute();
    assert.equal(menu.calls.length, before + 1);
    assert.equal(menu.calls.at(-1), callbackData);
    assert.equal(view.text, callbackData);
  }
});

test('GitHub plugin does not consume unrelated commands or callbacks', () => {
  const plugin = createGitHubPlugin({ github: {}, menu: makeMenu() });

  assert.equal(plugin.resolveCommand('/start'), null);
  assert.equal(plugin.resolveCallback('menu:main'), null);
  assert.equal(plugin.resolveCallback('menu:status'), null);
  assert.equal(plugin.resolveCallback('menu:tools'), null);
  assert.equal(plugin.resolveCallback('tool:ping'), null);
});
