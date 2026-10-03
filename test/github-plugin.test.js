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
    },
    async getWorkflowActionResultView(repoId, runId, action) {
      calls.push(`result:${action}:${repoId}:${runId}`);
      return { text: `done:${action}`, reply_markup: { inline_keyboard: [] } };
    }
  };
}

function makeGitHub() {
  const calls = [];
  return {
    calls,
    async rerunFailedWorkflowRun(repoId, runId) {
      calls.push(`rerun:${repoId}:${runId}`);
      return { accepted: true, status: 201 };
    },
    async cancelWorkflowRun(repoId, runId) {
      calls.push(`cancel:${repoId}:${runId}`);
      return { accepted: true, status: 202 };
    }
  };
}

test('GitHub plugin manifest registers read and write workflow actions with explicit risk', () => {
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu });
  const registry = new PluginRegistry([plugin]);

  const readActions = [
    'github.repos.list',
    'github.repo.detail',
    'github.files.list',
    'github.tree.read',
    'github.blob.read',
    'github.pr.list',
    'github.commits.list',
    'github.status.read',
    'github.workflow.runs.list',
    'github.workflow.run.detail',
    'github.workflow.jobs.list'
  ];
  for (const actionId of readActions) {
    assert.equal(registry.getAction(actionId)?.risk, 'READ');
  }

  assert.equal(registry.getAction('github.workflow.run.rerun_failed')?.risk, 'WRITE');
  assert.equal(registry.getAction('github.workflow.run.cancel')?.risk, 'WRITE');
});

test('GitHub plugin resolves /repos without executing the menu before policy', async () => {
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu });

  const route = plugin.resolveCommand('/repos');

  assert.equal(route.actionId, 'github.repos.list');
  assert.deepEqual(menu.calls, []);
  assert.equal(await route.execute(), menu.reposView);
  assert.deepEqual(menu.calls, ['/repos']);
  assert.equal(plugin.resolveCommand('/status'), null);
});

test('GitHub plugin maps read callback families to declared actions without eager execution', async () => {
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu });
  const cases = [
    ['menu:repos', 'github.repos.list'],
    ['repo:123', 'github.repo.detail'],
    ['files:123', 'github.files.list'],
    ['tree:123:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'github.tree.read'],
    ['blob:123:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'github.blob.read'],
    ['pr:123', 'github.pr.list'],
    ['commits:123', 'github.commits.list'],
    ['status:123', 'github.status.read'],
    ['runs:123', 'github.workflow.runs.list'],
    ['run:123:77', 'github.workflow.run.detail'],
    ['jobs:123:77', 'github.workflow.jobs.list']
  ];

  for (const [callbackData, actionId] of cases) {
    const before = menu.calls.length;
    const route = plugin.resolveCallback(callbackData);
    assert.equal(route.actionId, actionId);
    assert.equal(menu.calls.length, before, 'route resolution must be side-effect-free');
    const view = await route.execute();
    assert.equal(menu.calls.length, before + 1);
    assert.equal(menu.calls.at(-1), callbackData);
    assert.equal(view.text, callbackData);
  }
});

test('GitHub plugin write callbacks expose compact approval metadata and defer provider calls', async () => {
  const menu = makeMenu();
  const github = makeGitHub();
  const plugin = createGitHubPlugin({ github, menu });

  const rerun = plugin.resolveCallback('rerun:123:77');
  assert.equal(rerun.actionId, 'github.workflow.run.rerun_failed');
  assert.deepEqual(rerun.approval, {
    input: { repoId: 123, runId: 77 },
    label: 'اجرای مجدد jobهای ناموفق'
  });
  assert.deepEqual(github.calls, []);
  const rerunView = await rerun.execute();
  assert.deepEqual(github.calls, ['rerun:123:77']);
  assert.equal(rerunView.text, 'done:rerun_failed');

  github.calls.length = 0;
  const cancel = plugin.resolveCallback('cancelrun:123:77');
  assert.equal(cancel.actionId, 'github.workflow.run.cancel');
  assert.deepEqual(cancel.approval, {
    input: { repoId: 123, runId: 77 },
    label: 'لغو Workflow در حال اجرا'
  });
  assert.deepEqual(github.calls, []);
  const cancelView = await cancel.execute();
  assert.deepEqual(github.calls, ['cancel:123:77']);
  assert.equal(cancelView.text, 'done:cancel');
});

test('GitHub plugin rejects malformed workflow callback ids and unrelated callbacks', () => {
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu: makeMenu() });

  assert.equal(plugin.resolveCommand('/start'), null);
  assert.equal(plugin.resolveCallback('run:abc:77'), null);
  assert.equal(plugin.resolveCallback('rerun:123:nope'), null);
  assert.equal(plugin.resolveCallback('menu:main'), null);
  assert.equal(plugin.resolveCallback('menu:status'), null);
  assert.equal(plugin.resolveCallback('menu:tools'), null);
  assert.equal(plugin.resolveCallback('tool:ping'), null);
});
