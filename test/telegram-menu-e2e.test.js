import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';

const repoId = 123;
const fullSha = '0123456789abcdef0123456789abcdef01234567';
const github = {
  async getRepository() { return { id: repoId, name: 'nexa-dev-bot', fullName: 'davoodmehraban89/nexa-dev-bot', defaultBranch: 'main' }; },
  async listCommits() { return [{ sha: fullSha, shortSha: fullSha.slice(0, 7), message: 'Audit commit report', author: 'owner', date: '2026-10-04T12:00:00Z' }]; },
  async getCommit() { return { sha: fullSha, shortSha: fullSha.slice(0, 7), message: 'Audit commit report\n\nDetailed commit body', author: 'owner', date: '2026-10-04T12:00:00Z', additions: 12, deletions: 4, changedFiles: 2, files: [{ filename: 'src/menu.js', status: 'modified', additions: 8, deletions: 2 }, { filename: 'test/menu.test.js', status: 'modified', additions: 4, deletions: 2 }] }; },
  async listIssuesPage() { return { items: [{ number: 7, title: 'Broken report', state: 'open', author: 'owner', comments: 3 }], hasMore: false }; },
  async getIssue() { return { number: 7, title: 'Broken report', state: 'open', author: 'owner', comments: 3, body: 'Reproduction and expected result', labels: ['bug'], assignees: ['owner'], createdAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T11:00:00Z' }; },
  async listReleases() { return [{ id: 9, tag: 'v2.1.0', name: 'V2.1', draft: false, prerelease: false, publishedAt: '2026-10-04T10:00:00Z' }]; },
  async getRelease() { return { id: 9, tag: 'v2.1.0', name: 'V2.1', body: 'Production release notes', draft: false, prerelease: false, publishedAt: '2026-10-04T10:00:00Z', author: 'owner', target: 'main' }; }
};
const menu = { async renderByCallback() { return { text: 'fallback', reply_markup: { inline_keyboard: [] } }; } };
const workspaces = { async getWorkspace() { return null; } };

function callbacks(view) { return view.reply_markup.inline_keyboard.flat().map(button => button.callback_data).filter(Boolean); }
function assertTelegramContract(view) {
  assert.ok(view.text && view.text.length <= 4096);
  for (const callback of callbacks(view)) assert.ok(Buffer.byteLength(callback, 'utf8') <= 64, callback);
}

test('commit list drills into source-backed commit detail and preserves recovery navigation', async () => {
  const plugin = createGitHubPlugin({ github, menu, workspaces });
  const list = await plugin.resolveCallback(`commits:${repoId}`).execute();
  assertTelegramContract(list);
  assert.ok(callbacks(list).includes(`commitdetail:${repoId}:${fullSha}`), 'commit list must expose detail drill-down');
  const detail = await plugin.resolveCallback(`commitdetail:${repoId}:${fullSha}`).execute();
  assertTelegramContract(detail);
  assert.match(detail.text, /Detailed commit body/);
  assert.match(detail.text, /src\/menu\.js/);
  assert.match(detail.text, /\+12\/-4/);
  assert.ok(callbacks(detail).includes(`commits:${repoId}`));
});

test('issue list drills into actionable issue detail and preserves recovery navigation', async () => {
  const plugin = createGitHubPlugin({ github, menu, workspaces });
  const list = await plugin.resolveCallback(`issues:${repoId}`).execute();
  assertTelegramContract(list);
  assert.ok(callbacks(list).includes(`issuedetail:${repoId}:7`), 'issue list must expose detail drill-down');
  const detail = await plugin.resolveCallback(`issuedetail:${repoId}:7`).execute();
  assertTelegramContract(detail);
  assert.match(detail.text, /Reproduction and expected result/);
  assert.ok(callbacks(detail).includes(`issues:${repoId}`));
});

test('release list drills into source-backed release notes and preserves recovery navigation', async () => {
  const plugin = createGitHubPlugin({ github, menu, workspaces });
  const list = await plugin.resolveCallback(`releases:${repoId}`).execute();
  assertTelegramContract(list);
  assert.ok(callbacks(list).includes(`releasedetail:${repoId}:9`), 'release list must expose detail drill-down');
  const detail = await plugin.resolveCallback(`releasedetail:${repoId}:9`).execute();
  assertTelegramContract(detail);
  assert.match(detail.text, /Production release notes/);
  assert.ok(callbacks(detail).includes(`releases:${repoId}`));
});

test('repository report views always retain a project recovery route', async () => {
  const emptyGithub = {
    ...github,
    async listCommits() { return []; },
    async listIssuesPage() { return { items: [], hasMore: false }; },
    async listReleases() { return []; }
  };
  const plugin = createGitHubPlugin({ github: emptyGithub, menu, workspaces });
  for (const callback of [`commits:${repoId}`, `issues:${repoId}`, `releases:${repoId}`]) {
    const view = await plugin.resolveCallback(callback).execute();
    assertTelegramContract(view);
    assert.ok(callbacks(view).includes(`repo:${repoId}`), `${callback} must retain project recovery`);
  }
});