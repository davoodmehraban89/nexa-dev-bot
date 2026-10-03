import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';

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

function repositoryContext(id = 123) {
  return {
    id,
    name: 'nexa-dev-bot',
    full_name: 'davoodmehraban89/nexa-dev-bot',
    default_branch: 'main',
    private: true
  };
}

test('GitHubService fails closed when GITHUB_TOKEN is missing', async () => {
  const service = new GitHubService('', 'davoodmehraban89');
  await assert.rejects(() => service.listRepositories(), /GITHUB_TOKEN/i);
});

test('GitHubService surfaces GitHub API failures instead of returning sample data', async () => {
  await withFetch(
    async () => json({ message: 'Bad credentials' }, 401),
    async () => {
      const service = new GitHubService('bad-token', 'davoodmehraban89');
      await assert.rejects(() => service.listPullRequests('Factor-easy'), /401|Bad credentials/i);
    }
  );
});

test('GitHubService repository listing uses the authenticated user endpoint', async () => {
  let requestedUrl = '';
  await withFetch(async (url) => {
    requestedUrl = String(url);
    if (requestedUrl.startsWith('https://api.github.com/user/repos?')) {
      return json([
        {
          name: 'nexa-dev-bot',
          full_name: 'davoodmehraban89/nexa-dev-bot',
          private: true,
          stargazers_count: 0,
          forks_count: 0,
          description: 'Personal Telegram developer console for GitHub'
        }
      ]);
    }
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token', 'davoodmehraban89');
    const repos = await service.listRepositories();
    assert.match(requestedUrl, /\/user\/repos\?/);
    assert.equal(repos.length, 1);
    assert.equal(repos[0].name, 'nexa-dev-bot');
    assert.equal(repos[0].private, true);
  });
});

test('GitHubService lists and maps workflow runs for a numeric repository id', async () => {
  const calls = [];
  await withFetch(async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, method: options.method || 'GET' });
    if (value === 'https://api.github.com/repositories/123') return json(repositoryContext());
    if (value === 'https://api.github.com/repos/davoodmehraban89/nexa-dev-bot/actions/runs?per_page=10') {
      return json({ workflow_runs: [{
        id: 77,
        name: 'CI',
        status: 'completed',
        conclusion: 'failure',
        event: 'push',
        head_branch: 'main',
        head_sha: 'abcdef0123456789',
        run_number: 12,
        html_url: 'https://github.com/x/actions/runs/77',
        created_at: '2026-10-03T00:00:00Z',
        updated_at: '2026-10-03T00:01:00Z'
      }] });
    }
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    const runs = await service.listWorkflowRuns(123);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0], {
      id: 77,
      name: 'CI',
      status: 'completed',
      conclusion: 'failure',
      event: 'push',
      branch: 'main',
      sha: 'abcdef0',
      runNumber: 12,
      url: 'https://github.com/x/actions/runs/77',
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:01:00Z'
    });
    assert.equal(calls.at(-1).method, 'GET');
  });
});

test('GitHubService gets workflow run and lists jobs with bounded step details', async () => {
  await withFetch(async (url) => {
    const value = String(url);
    if (value === 'https://api.github.com/repositories/123') return json(repositoryContext());
    if (value.endsWith('/actions/runs/77')) {
      return json({
        id: 77,
        name: 'CI',
        status: 'completed',
        conclusion: 'failure',
        event: 'push',
        head_branch: 'main',
        head_sha: 'abcdef0123456789',
        run_number: 12,
        html_url: 'https://github.com/x/actions/runs/77',
        created_at: '2026-10-03T00:00:00Z',
        updated_at: '2026-10-03T00:01:00Z'
      });
    }
    if (value.endsWith('/actions/runs/77/jobs?per_page=20')) {
      return json({ jobs: [{
        id: 88,
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-10-03T00:00:10Z',
        completed_at: '2026-10-03T00:00:50Z',
        html_url: 'https://github.com/x/actions/runs/77/job/88',
        steps: [
          { number: 1, name: 'checkout', status: 'completed', conclusion: 'success' },
          { number: 2, name: 'test', status: 'completed', conclusion: 'failure' }
        ]
      }] });
    }
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    const run = await service.getWorkflowRun(123, 77);
    assert.equal(run.id, 77);
    assert.equal(run.sha, 'abcdef0');
    const jobs = await service.listWorkflowJobs(123, 77);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, 88);
    assert.equal(jobs[0].steps[1].conclusion, 'failure');
  });
});

test('GitHubService uses POST endpoints for rerun failed and cancel and accepts empty success bodies', async () => {
  const calls = [];
  await withFetch(async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, method: options.method || 'GET', headers: options.headers });
    if (value === 'https://api.github.com/repositories/123') return json(repositoryContext());
    if (value.endsWith('/actions/runs/77/rerun-failed-jobs')) return new Response(null, { status: 201 });
    if (value.endsWith('/actions/runs/77/cancel')) return new Response(null, { status: 202 });
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    assert.deepEqual(await service.rerunFailedWorkflowRun(123, 77), { accepted: true, status: 201 });
    assert.deepEqual(await service.cancelWorkflowRun(123, 77), { accepted: true, status: 202 });
    assert.equal(calls.find(call => call.url.endsWith('/rerun-failed-jobs')).method, 'POST');
    assert.equal(calls.find(call => call.url.endsWith('/cancel')).method, 'POST');
  });
});

test('GitHubService write actions surface provider permission/state errors', async () => {
  for (const [status, message] of [[403, 'Resource not accessible by personal access token'], [409, 'Conflict'], [422, 'Validation Failed']]) {
    await withFetch(async (url) => {
      const value = String(url);
      if (value === 'https://api.github.com/repositories/123') return json(repositoryContext());
      return json({ message }, status);
    }, async () => {
      const service = new GitHubService('token');
      await assert.rejects(
        () => service.rerunFailedWorkflowRun(123, 77),
        new RegExp(`${status}|${message}`, 'i')
      );
    });
  }
});
