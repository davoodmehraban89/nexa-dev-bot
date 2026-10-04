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
      return {
        text: data,
        reply_markup: {
          inline_keyboard: data.startsWith('repo:')
            ? [[{ text: '🔙 بازگشت', callback_data: 'menu:repos' }]]
            : []
        }
      };
    }
  };
}

function makeGitHub() {
  const calls = [];
  return {
    calls,
    async getRepository(repoId) {
      calls.push(`repo:${repoId}`);
      return { id: String(repoId), name: 'demo', fullName: 'davood/demo' };
    },
    async listPullRequests(repoId) {
      calls.push(`prs:${repoId}`);
      return [];
    },
    async listWorkflowRuns(repoId) {
      calls.push(`runs:${repoId}`);
      return [{
        id: 77,
        name: 'CI',
        status: 'completed',
        conclusion: 'failure',
        branch: 'main',
        sha: 'abcdef0',
        runNumber: 12
      }];
    },
    async getWorkflowRun(repoId, runId) {
      calls.push(`run:${repoId}:${runId}`);
      return {
        id: Number(runId),
        name: 'CI',
        status: 'completed',
        conclusion: 'failure',
        branch: 'main',
        sha: 'abcdef0',
        runNumber: 12
      };
    },
    async listWorkflowJobs(repoId, runId) {
      calls.push(`jobs:${repoId}:${runId}`);
      return [{
        id: 88,
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        steps: [
          { number: 1, name: 'checkout', status: 'completed', conclusion: 'success' },
          { number: 2, name: 'test', status: 'completed', conclusion: 'failure' }
        ]
      }];
    },
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
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu: makeMenu() });
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
  const github = makeGitHub();
  const plugin = createGitHubPlugin({ github, menu });
  const cases = [
    ['menu:repos', 'github.repos.list'],
    ['repo:123', 'github.repo.detail'],
    ['files:123', 'github.files.list'],
    ['tree:123:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'github.tree.read'],
    ['blob:123:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'github.blob.read'],
    ['pr:123', 'github.pr.advanced.list'],
    ['commits:123', 'github.commits.list'],
    ['status:123', 'github.status.read'],
    ['runs:123', 'github.workflow.runs.list'],
    ['run:123:77', 'github.workflow.run.detail'],
    ['jobs:123:77', 'github.workflow.jobs.list']
  ];

  for (const [callbackData, actionId] of cases) {
    const beforeMenu = menu.calls.length;
    const beforeGitHub = github.calls.length;
    const route = plugin.resolveCallback(callbackData);
    assert.equal(route.actionId, actionId);
    assert.equal(menu.calls.length, beforeMenu, 'route resolution must be side-effect-free');
    assert.equal(github.calls.length, beforeGitHub, 'route resolution must not call GitHub');
    const view = await route.execute();
    assert.ok(view?.text);
  }
});

test('repository detail view is augmented with CI / Actions navigation without changing menu manager', async () => {
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu });
  const view = await plugin.resolveCallback('repo:123').execute();
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some(button => button.callback_data === 'runs:123'));
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
  assert.match(rerunView.text, /اجرا.*مجدد|دوباره/i);
  assert.ok(rerunView.reply_markup.inline_keyboard.flat().some(button => button.callback_data === 'run:123:77'));

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
  assert.match(cancelView.text, /لغو/);
});

test('GitHub workflow views expose bounded navigation and write-action callbacks', async () => {
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu: makeMenu() });

  const runsView = await plugin.resolveCallback('runs:123').execute();
  assert.match(runsView.text, /CI/);
  assert.ok(runsView.reply_markup.inline_keyboard.flat().some(button => button.callback_data === 'run:123:77'));

  const runView = await plugin.resolveCallback('run:123:77').execute();
  const runButtons = runView.reply_markup.inline_keyboard.flat();
  assert.ok(runButtons.some(button => button.callback_data === 'jobs:123:77'));
  assert.ok(runButtons.some(button => button.callback_data === 'rerun:123:77'));

  const jobsView = await plugin.resolveCallback('jobs:123:77').execute();
  assert.match(jobsView.text, /checkout/);
  assert.match(jobsView.text, /test/);
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
