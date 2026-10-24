import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('numeric private repository lookup falls back through accessible repositories when /repositories/:id returns 404', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const repoId = 1401612143;

  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);

    if (value === `https://api.github.com/repositories/${repoId}`) {
      return json({ message: 'Not Found' }, 404);
    }

    if (value.startsWith('https://api.github.com/user/repos?')) {
      return json([
        {
          id: repoId,
          name: 'nexa-dev-bot',
          full_name: 'davoodmehraban89/nexa-dev-bot',
          private: true,
          default_branch: 'main',
          archived: false,
          description: 'Personal Telegram developer console for GitHub',
          html_url: 'https://github.com/davoodmehraban89/nexa-dev-bot',
          stargazers_count: 0,
          forks_count: 0
        }
      ]);
    }

    if (
      value === 'https://api.github.com/repos/davoodmehraban89/nexa-dev-bot'
    ) {
      return json({
        id: repoId,
        name: 'nexa-dev-bot',
        full_name: 'davoodmehraban89/nexa-dev-bot',
        private: true,
        default_branch: 'main',
        archived: false,
        description: 'Personal Telegram developer console for GitHub',
        html_url: 'https://github.com/davoodmehraban89/nexa-dev-bot',
        stargazers_count: 0,
        forks_count: 0
      });
    }

    throw new Error(`Unexpected URL: ${value}`);
  };

  try {
    const github = new GitHubService('test-token', 'davoodmehraban89');
    const repo = await github.getRepository(repoId);

    assert.equal(repo.id, String(repoId));
    assert.equal(repo.fullName, 'davoodmehraban89/nexa-dev-bot');
    assert.ok(calls.includes(`https://api.github.com/repositories/${repoId}`));
    assert.ok(
      calls.some((value) =>
        value.startsWith('https://api.github.com/user/repos?')
      )
    );
    assert.ok(
      calls.includes(
        'https://api.github.com/repos/davoodmehraban89/nexa-dev-bot'
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('numeric repository lookup does not fall back for non-404 provider failures', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const repoId = 1401612143;

  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value === `https://api.github.com/repositories/${repoId}`) {
      return json(
        { message: 'Resource not accessible by personal access token' },
        403
      );
    }
    throw new Error(`Unexpected fallback URL: ${value}`);
  };

  try {
    const github = new GitHubService('test-token', 'davoodmehraban89');
    await assert.rejects(
      () => github.getRepository(repoId),
      /GitHub repository failed: 403 Resource not accessible by personal access token/
    );
    assert.deepEqual(calls, [`https://api.github.com/repositories/${repoId}`]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('numeric repository 404 preserves the original failure when no accessible repository matches the id', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const repoId = 1401612143;

  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value === `https://api.github.com/repositories/${repoId}`) {
      return json({ message: 'Not Found' }, 404);
    }
    if (value.startsWith('https://api.github.com/user/repos?')) {
      return json([
        {
          id: 42,
          name: 'another-repo',
          full_name: 'davoodmehraban89/another-repo',
          private: true,
          default_branch: 'main'
        }
      ]);
    }
    throw new Error(`Unexpected URL: ${value}`);
  };

  try {
    const github = new GitHubService('test-token', 'davoodmehraban89');
    await assert.rejects(
      () => github.getRepository(repoId),
      /GitHub repository failed: 404 Not Found/
    );
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
