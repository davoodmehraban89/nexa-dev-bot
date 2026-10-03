import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';

async function withFetch(mock, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('GitHubService requests a bounded workflow-runs page', async () => {
  const requested = [];
  await withFetch(async url => {
    const value = String(url);
    requested.push(value);
    if (value === 'https://api.github.com/repositories/123') {
      return json({ id: 123, name: 'nexa-dev-bot', full_name: 'davoodmehraban89/nexa-dev-bot' });
    }
    if (value === 'https://api.github.com/repos/davoodmehraban89/nexa-dev-bot/actions/runs?per_page=10&page=2') {
      return json({ workflow_runs: [] });
    }
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    await service.listWorkflowRuns(123, { perPage: 10, page: 2 });
  });

  assert.equal(requested.at(-1), 'https://api.github.com/repos/davoodmehraban89/nexa-dev-bot/actions/runs?per_page=10&page=2');
});

test('GitHub plugin navigates older and newer CI pages without write side effects', async () => {
  const calls = [];
  const github = {
    async getRepository(repoId) {
      return { id: String(repoId), name: 'nexa-dev-bot' };
    },
    async listWorkflowRuns(repoId, options) {
      calls.push({ repoId, options });
      return Array.from({ length: 10 }, (_, index) => ({
        id: 200 - index,
        name: 'CI',
        status: 'completed',
        conclusion: index === 9 ? 'failure' : 'success',
        branch: 'main',
        sha: `abcde${index}`,
        runNumber: 140 - index
      }));
    }
  };
  const menu = {
    async getReposListView() { return { text: 'repos', reply_markup: { inline_keyboard: [] } }; },
    async renderByCallback(data) { return { text: data, reply_markup: { inline_keyboard: [] } }; }
  };

  const plugin = createGitHubPlugin({ github, menu });
  const route = plugin.resolveCallback('runs:123:2');
  assert.ok(route);
  assert.equal(route.actionId, 'github.workflow.runs.list');
  assert.deepEqual(calls, []);

  const view = await route.execute();
  assert.deepEqual(calls, [{ repoId: 123, options: { perPage: 10, page: 2 } }]);
  const callbacks = view.reply_markup.inline_keyboard.flat().map(button => button.callback_data);
  assert.ok(callbacks.includes('runs:123:1'));
  assert.ok(callbacks.includes('runs:123:3'));
});
