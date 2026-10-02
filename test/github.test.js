import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';

test('GitHubService fails closed when GITHUB_TOKEN is missing', async () => {
  const service = new GitHubService('', 'davoodmehraban89');
  await assert.rejects(() => service.listRepositories(), /GITHUB_TOKEN/i);
});

test('GitHubService surfaces GitHub API failures instead of returning sample data', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const service = new GitHubService('bad-token', 'davoodmehraban89');
    await assert.rejects(() => service.listPullRequests('Factor-easy'), /401|Bad credentials/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GitHubService repository listing uses the authenticated user endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    if (requestedUrl.startsWith('https://api.github.com/user/repos?')) {
      return new Response(JSON.stringify([
        {
          name: 'nexa-dev-bot',
          full_name: 'davoodmehraban89/nexa-dev-bot',
          private: true,
          stargazers_count: 0,
          forks_count: 0,
          description: 'Personal Telegram developer console for GitHub',
        },
      ]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'Not Found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const service = new GitHubService('token', 'davoodmehraban89');
    const repos = await service.listRepositories();
    assert.match(requestedUrl, /\/user\/repos\?/);
    assert.equal(repos.length, 1);
    assert.equal(repos[0].name, 'nexa-dev-bot');
    assert.equal(repos[0].private, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
