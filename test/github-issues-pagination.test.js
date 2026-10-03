import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';

const repo = {
  id: 123,
  name: 'nexa-dev-bot',
  full_name: 'davoodmehraban89/nexa-dev-bot',
  default_branch: 'main',
  private: true
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

test('GitHub issue page keeps raw-page hasMore even when pull requests are filtered out', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value === 'https://api.github.com/repositories/123') return json(repo);
    if (value === 'https://api.github.com/repos/davoodmehraban89/nexa-dev-bot/issues?state=all&per_page=20&page=2') {
      const mixed = Array.from({ length: 20 }, (_, index) => index < 7
        ? { number: index + 1, title: `issue-${index + 1}`, state: 'open', user: { login: 'u' }, comments: 0 }
        : { number: index + 1, title: `pr-${index + 1}`, state: 'open', pull_request: {} });
      return json(mixed);
    }
    return json({ message: 'Not Found' }, 404);
  };

  try {
    const service = new GitHubService('token');
    const page = await service.listIssuesPage(123, { page: 2 });
    assert.equal(page.items.length, 7);
    assert.equal(page.hasMore, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Issues view shows older-page navigation from provider hasMore, not filtered item count', async () => {
  const github = {
    async getRepository() { return { id: '123', name: 'nexa-dev-bot', defaultBranch: 'main' }; },
    async listIssuesPage() {
      return {
        items: [{ number: 4, title: 'Bug', state: 'open', author: 'u', comments: 0 }],
        hasMore: true
      };
    }
  };
  const menu = {
    async getReposListView() { return { text: 'repos', reply_markup: { inline_keyboard: [] } }; },
    async renderByCallback() { return { text: 'legacy', reply_markup: { inline_keyboard: [] } }; }
  };
  const plugin = createGitHubPlugin({ github, menu });
  const view = await plugin.resolveCallback('issues:123:2').execute();
  const callbacks = view.reply_markup.inline_keyboard.flat().map(button => button.callback_data).filter(Boolean);
  assert.ok(callbacks.includes('issues:123:1'));
  assert.ok(callbacks.includes('issues:123:3'));
});
