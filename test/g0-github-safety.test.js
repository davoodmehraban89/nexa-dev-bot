import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';
import { createWorkspaceController } from '../src/plugins/github/workspace.js';

const HEAD_SHA = 'a'.repeat(40);
const TREE_SHA = 'b'.repeat(40);
const REPO_URL = 'https://api.github.com/repos/owner/demo';
const REPO = {
  id: 123,
  name: 'demo',
  full_name: 'owner/demo',
  default_branch: 'main',
  archived: false
};

async function withGitHubFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value === 'https://api.github.com/repositories/123') {
      return Response.json(REPO);
    }
    return handler(value, options);
  };
  try {
    return await run(new GitHubService('fixture-token'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function filePreview(path, content) {
  return withGitHubFetch(
    async (url) => {
      if (url === `${REPO_URL}/git/ref/heads/main`) {
        return Response.json({ object: { sha: HEAD_SHA } });
      }
      if (url === `${REPO_URL}/git/commits/${HEAD_SHA}`) {
        return Response.json({ tree: { sha: TREE_SHA } });
      }
      if (url === `${REPO_URL}/contents/${path}?ref=${HEAD_SHA}`) {
        return Response.json({
          type: 'file',
          path,
          sha: 'c'.repeat(40),
          size: content.length,
          encoding: 'base64',
          content: btoa(content)
        });
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    },
    async (github) => {
      const controller = createWorkspaceController({
        github,
        workspaces: {
          async resolveNavigationRef({ ownerId, refId }) {
            assert.equal(ownerId, '42');
            assert.equal(refId, 'R123456789');
            return { repoId: 123, path, type: 'file' };
          }
        }
      });
      return controller
        .resolveCallback('wnav:R123456789', { ownerId: '42' })
        .execute();
    }
  );
}

test('sensitive file previews withhold source from the Telegram payload and offer no Edit', async () => {
  const content = 'AUDIT_SECRET_SENTINEL=<private-value>\n';
  const view = await filePreview('.env.production', content);

  assert.doesNotMatch(
    JSON.stringify(view),
    /AUDIT_SECRET_SENTINEL|private-value/
  );
  assert.equal(
    view.reply_markup.inline_keyboard
      .flat()
      .some((button) => button.callback_data?.startsWith('wedit:')),
    false
  );
  assert.match(view.text, /حساس|Sensitive/);
});

test('ordinary legacy file previews retain escaped source and the Edit action', async () => {
  const view = await filePreview('app.js', 'console.log("<ordinary>");\n');

  assert.match(view.text, /&lt;ordinary&gt;/);
  assert.ok(
    view.reply_markup.inline_keyboard
      .flat()
      .some((button) => button.callback_data === 'wedit:R123456789')
  );
});

test('draft PRs remain draft through the provider and cannot reach the merge mutation', async () => {
  let mergeRequests = 0;
  await withGitHubFetch(
    async (url, options) => {
      if (url === `${REPO_URL}/pulls/19`) {
        return Response.json({
          number: 19,
          title: 'Draft change',
          state: 'open',
          draft: true,
          merged: false,
          user: { login: 'developer' },
          head: { ref: 'feature/draft', sha: HEAD_SHA },
          base: { ref: 'main' }
        });
      }
      if (url === `${REPO_URL}/pulls/19/merge` && options.method === 'PUT') {
        mergeRequests += 1;
        return Response.json({ merged: true, sha: 'd'.repeat(40) });
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    },
    async (github) => {
      const plugin = createGitHubPlugin({ github, menu: {} });
      const merge = plugin.resolveCallback(`mergepr:3f:j:${HEAD_SHA}`);

      await assert.rejects(merge.execute(), /not mergeable/i);
      assert.equal(mergeRequests, 0);
      assert.equal((await github.getPullRequest(123, 19)).draft, true);
      const detail = await plugin.resolveCallback('prdetail:123:19').execute();
      assert.equal(
        detail.reply_markup.inline_keyboard
          .flat()
          .some((button) => button.callback_data?.startsWith('mergepr:')),
        false
      );
    }
  );
});
