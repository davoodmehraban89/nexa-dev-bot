import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';
import { githubPluginManifest } from '../src/plugins/github/manifest.js';

const sha = 'a'.repeat(40);

function callbacks(view) {
  return (view?.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => button.callback_data)
    .filter(Boolean);
}

function makeGitHub() {
  const calls = [];
  const hit = (name, value) => {
    calls.push([name, value]);
    return value;
  };
  return {
    calls,
    async getRepository(id) {
      return hit('getRepository', {
        id: String(id),
        name: 'nexa-dev-bot',
        defaultBranch: 'main'
      });
    },
    async listWorkflowRuns() {
      return [
        {
          id: 77,
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          branch: 'main',
          sha: 'abc1234',
          runNumber: 44
        }
      ];
    },
    async getWorkflowRun(repo, run) {
      return hit('getWorkflowRun', {
        id: run,
        name: 'CI',
        status: 'completed',
        conclusion: 'failure',
        runNumber: 134,
        branch: 'main',
        sha: 'abc1234',
        event: 'push'
      });
    },
    async listWorkflowJobs() {
      return hit('listWorkflowJobs', [
        {
          id: 88,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          steps: [{ number: 1, name: 'Run tests', conclusion: 'failure' }]
        }
      ]);
    },
    async getWorkflowJob() {
      return hit('getWorkflowJob', {
        id: 88,
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        steps: [{ number: 1, name: 'Run tests', conclusion: 'failure' }]
      });
    },
    async getWorkflowJobLog() {
      return hit('getWorkflowJobLog', {
        text: '<token>\nFAIL expected',
        truncated: true
      });
    },
    async listWorkflowArtifacts() {
      return hit('listWorkflowArtifacts', [
        {
          id: 9,
          name: 'coverage',
          size: 1234,
          expired: false,
          createdAt: '2026-10-03T00:00:00Z',
          expiresAt: '2026-10-10T00:00:00Z'
        }
      ]);
    },
    async listBranches() {
      return hit('listBranches', [
        { name: 'feature/x', sha, protected: false }
      ]);
    },
    async compareWithDefault() {
      return hit('compareWithDefault', {
        base: 'main',
        head: sha,
        status: 'ahead',
        aheadBy: 2,
        behindBy: 0,
        totalCommits: 2,
        files: [
          {
            filename: 'src/x.js',
            status: 'modified',
            additions: 3,
            deletions: 1,
            changes: 4,
            patch: '+x'
          }
        ]
      });
    },
    async listPullRequests() {
      return hit('listPullRequests', [
        {
          number: 19,
          title: 'Feature',
          author: 'dev',
          state: 'open',
          merged: false
        }
      ]);
    },
    async getPullRequest() {
      return hit('getPullRequest', {
        number: 19,
        title: 'Feature',
        author: 'dev',
        state: 'open',
        merged: false,
        body: 'Body',
        head: 'feature/x',
        headSha: sha,
        base: 'main',
        additions: 3,
        deletions: 1,
        changedFiles: 1
      });
    },
    async listPullRequestFiles() {
      return hit('listPullRequestFiles', [
        {
          filename: 'src/x.js',
          status: 'modified',
          additions: 3,
          deletions: 1,
          changes: 4,
          patch: '+x'
        }
      ]);
    },
    async listCommitChecks() {
      return hit('listCommitChecks', [
        { id: 7, name: 'CI', status: 'completed', conclusion: 'success' }
      ]);
    },
    async listIssues() {
      return hit('listIssues', [
        { number: 4, title: 'Bug', state: 'open', author: 'u', comments: 2 }
      ]);
    },
    async listIssuesPage() {
      return hit('listIssuesPage', {
        items: [
          { number: 4, title: 'Bug', state: 'open', author: 'u', comments: 2 }
        ],
        hasMore: false
      });
    },
    async listReleases() {
      return hit('listReleases', [
        {
          id: 6,
          tag: 'v1.2.0',
          name: 'Release 1.2',
          draft: false,
          prerelease: false,
          publishedAt: '2026-10-03T00:00:00Z'
        }
      ]);
    },
    async rerunFailedWorkflowRun() {},
    async cancelWorkflowRun() {}
  };
}

function makeMenu() {
  return {
    async getReposListView() {
      return { text: 'repos', reply_markup: { inline_keyboard: [] } };
    },
    async renderByCallback(data) {
      if (String(data).startsWith('repo:')) {
        const repoId = String(data).split(':')[1];
        return {
          text: 'repo',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'PRها', callback_data: `pr:${repoId}` },
                { text: 'وضعیت', callback_data: `status:${repoId}` }
              ],
              [{ text: 'back', callback_data: 'menu:repos' }]
            ]
          }
        };
      }
      return { text: `legacy:${data}`, reply_markup: { inline_keyboard: [] } };
    }
  };
}

const advancedReadActions = [
  'github.workflow.job.detail',
  'github.workflow.job.log',
  'github.workflow.artifacts.list',
  'github.branches.list',
  'github.compare.read',
  'github.pr.advanced.list',
  'github.pr.detail',
  'github.pr.files.list',
  'github.pr.checks.list',
  'github.issues.list',
  'github.releases.list'
];

test('GitHub Advanced manifest declares every new action as READ', () => {
  for (const actionId of advancedReadActions)
    assert.equal(
      githubPluginManifest.actions[actionId]?.risk,
      'READ',
      actionId
    );
});

test('advanced callbacks resolve without provider side effects and callbacks stay Telegram-safe', async () => {
  const github = makeGitHub();
  const plugin = createGitHubPlugin({ github, menu: makeMenu() });
  const samples = [
    ['job:123:88', 'github.workflow.job.detail'],
    ['joblog:123:88', 'github.workflow.job.log'],
    ['artifacts:123:77', 'github.workflow.artifacts.list'],
    ['branches:123', 'github.branches.list'],
    [`compare:123:${sha}`, 'github.compare.read'],
    ['prs:123', 'github.pr.advanced.list'],
    ['prdetail:123:19', 'github.pr.detail'],
    ['prfiles:123:19:1', 'github.pr.files.list'],
    ['prchecks:123:19:1', 'github.pr.checks.list'],
    ['issues:123', 'github.issues.list'],
    ['releases:123', 'github.releases.list']
  ];
  for (const [data, actionId] of samples) {
    const route = plugin.resolveCallback(data);
    assert.equal(route?.actionId, actionId, data);
    assert.equal(
      github.calls.length,
      0,
      `provider called during resolve: ${data}`
    );
    const view = await route.execute();
    for (const callback of callbacks(view))
      assert.ok(
        callback.length <= 64,
        `${callback} exceeds Telegram callback_data limit`
      );
    github.calls.length = 0;
  }
});

test('repository and workflow views expose Advanced READ navigation', async () => {
  const github = makeGitHub();
  const plugin = createGitHubPlugin({ github, menu: makeMenu() });
  const repoView = await plugin.resolveCallback('repo:123').execute();
  const repoCallbacks = callbacks(repoView);
  for (const expected of [
    'status:123',
    'branches:123',
    'pr:123',
    'issues:123',
    'releases:123'
  ])
    assert.ok(repoCallbacks.includes(expected), expected);
  assert.ok(
    !repoCallbacks.includes('prs:123'),
    'repository view must not expose a duplicate advanced PR entry'
  );
  assert.ok(
    !repoCallbacks.includes('runs:123'),
    'repository view must not expose a duplicate CI entry'
  );

  const runView = await plugin.resolveCallback('run:123:77').execute();
  assert.ok(callbacks(runView).includes('artifacts:123:77'));

  const jobsView = await plugin.resolveCallback('jobs:123:77').execute();
  assert.ok(callbacks(jobsView).includes('job:123:88'));

  const jobView = await plugin.resolveCallback('job:123:88').execute();
  assert.ok(callbacks(jobView).includes('joblog:123:88'));
});

test('legacy repository status button resolves to actionable workflow runs', async () => {
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu: makeMenu() });
  const route = plugin.resolveCallback('status:123');
  assert.equal(route?.actionId, 'github.workflow.runs.list');
  const view = await route.execute();
  assert.ok(
    callbacks(view).includes('run:123:77'),
    'repository status button must drill into workflow run detail'
  );
});

test('legacy repository PR button resolves to the actionable advanced PR report', async () => {
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu: makeMenu() });
  const route = plugin.resolveCallback('pr:123');
  assert.equal(route?.actionId, 'github.pr.advanced.list');
  const view = await route.execute();
  assert.ok(
    callbacks(view).includes('prdetail:123:19'),
    'repository PR button must drill into PR detail'
  );
});

test('failed job log is escaped and bounded-tail state is visible', async () => {
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu: makeMenu() });
  const view = await plugin.resolveCallback('joblog:123:88').execute();
  assert.match(view.text, /&lt;token&gt;/);
  assert.doesNotMatch(view.text, /<token>/);
  assert.match(view.text, /انتهای log|بخش پایانی|truncated/i);
});

test('branches, PRs, issues and releases provide useful drill-down and pagination', async () => {
  const plugin = createGitHubPlugin({ github: makeGitHub(), menu: makeMenu() });
  const branchView = await plugin.resolveCallback('branches:123').execute();
  assert.ok(callbacks(branchView).includes(`compare:123:${sha}`));

  const prList = await plugin.resolveCallback('prs:123').execute();
  assert.ok(callbacks(prList).includes('prdetail:123:19'));
  const prDetail = await plugin.resolveCallback('prdetail:123:19').execute();
  assert.ok(callbacks(prDetail).includes('prfiles:123:19:1'));
  assert.ok(callbacks(prDetail).includes('prchecks:123:19:1'));

  const issues = await plugin.resolveCallback('issues:123').execute();
  assert.match(issues.text, /#4/);
  const releases = await plugin.resolveCallback('releases:123').execute();
  assert.match(releases.text, /v1\.2\.0/);
});

test('artifacts support bounded page navigation instead of silently stopping at the first page', async () => {
  const calls = [];
  const github = makeGitHub();
  github.listWorkflowArtifacts = async (repoId, runId, options) => {
    calls.push({ repoId, runId, options });
    return Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `artifact-${i + 1}`,
      size: 1,
      expired: false
    }));
  };
  const plugin = createGitHubPlugin({ github, menu: makeMenu() });
  const route = plugin.resolveCallback('artifacts:123:77:2');
  assert.equal(route?.actionId, 'github.workflow.artifacts.list');
  const view = await route.execute();
  assert.deepEqual(calls[0], {
    repoId: 123,
    runId: 77,
    options: { perPage: 10, page: 2 }
  });
  assert.ok(callbacks(view).includes('artifacts:123:77:1'));
  assert.ok(callbacks(view).includes('artifacts:123:77:3'));
});

test('PR diff pages request only the number of files they can render and expose the next page', async () => {
  const calls = [];
  const github = makeGitHub();
  github.listPullRequestFiles = async (repoId, prNumber, options) => {
    calls.push({ repoId, prNumber, options });
    return Array.from({ length: 8 }, (_, i) => ({
      filename: `src/file-${i + 1}.js`,
      status: 'modified',
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: '+x'
    }));
  };
  const plugin = createGitHubPlugin({ github, menu: makeMenu() });
  const view = await plugin.resolveCallback('prfiles:123:19:1').execute();
  assert.deepEqual(calls[0], {
    repoId: 123,
    prNumber: 19,
    options: { perPage: 8, page: 1 }
  });
  assert.match(view.text, /file-8\.js/);
  assert.ok(callbacks(view).includes('prfiles:123:19:2'));
});
