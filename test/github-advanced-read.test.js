import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';

async function withFetch(mock, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await fn(); } finally { globalThis.fetch = originalFetch; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

const repo = {
  id: 123,
  name: 'nexa-dev-bot',
  full_name: 'davoodmehraban89/nexa-dev-bot',
  default_branch: 'main',
  private: true
};

const repoUrl = 'https://api.github.com/repos/davoodmehraban89/nexa-dev-bot';

test('GitHub Advanced reads expose job detail and bounded raw job logs', async () => {
  const calls = [];
  await withFetch(async (url) => {
    const value = String(url); calls.push(value);
    if (value === 'https://api.github.com/repositories/123') return json(repo);
    if (value === `${repoUrl}/actions/jobs/88`) return json({ id: 88, name: 'test', status: 'completed', conclusion: 'failure', steps: [] });
    if (value === `${repoUrl}/actions/jobs/88/logs`) return new Response('0123456789ABCDEFGHIJ', { status: 200 });
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    const job = await service.getWorkflowJob(123, 88);
    assert.equal(job.id, 88);
    const log = await service.getWorkflowJobLog(123, 88, { maxChars: 10 });
    assert.deepEqual(log, { text: 'ABCDEFGHIJ', truncated: true });
    assert.ok(calls.includes(`${repoUrl}/actions/jobs/88/logs`));
  });
});

test('GitHub Advanced reads list bounded workflow artifacts and branches', async () => {
  const calls = [];
  await withFetch(async (url) => {
    const value = String(url); calls.push(value);
    if (value === 'https://api.github.com/repositories/123') return json(repo);
    if (value === `${repoUrl}/actions/runs/77/artifacts?per_page=20&page=100`) return json({ artifacts: [{ id: 9, name: 'coverage', size_in_bytes: 1234, expired: false, created_at: '2026-10-03T00:00:00Z', expires_at: '2026-10-10T00:00:00Z', archive_download_url: 'https://api.github.com/a' }] });
    if (value === `${repoUrl}/branches?per_page=20&page=100`) return json([{ name: 'feature/x', commit: { sha: 'a'.repeat(40) }, protected: false }]);
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    const artifacts = await service.listWorkflowArtifacts(123, 77, { perPage: 999, page: 999 });
    assert.deepEqual(artifacts[0], { id: 9, name: 'coverage', size: 1234, expired: false, createdAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-10T00:00:00Z', downloadUrl: 'https://api.github.com/a' });
    const branches = await service.listBranches(123, { perPage: 999, page: 999 });
    assert.deepEqual(branches[0], { name: 'feature/x', sha: 'a'.repeat(40), protected: false });
  });
});

test('GitHub compare validates a 40-hex head and returns bounded file summaries', async () => {
  const head = 'b'.repeat(40);
  await withFetch(async (url) => {
    const value = String(url);
    if (value === 'https://api.github.com/repositories/123') return json(repo);
    if (value === `${repoUrl}/compare/main...${head}`) return json({ status: 'ahead', ahead_by: 2, behind_by: 0, total_commits: 2, base_commit: { sha: 'a'.repeat(40) }, merge_base_commit: { sha: 'c'.repeat(40) }, files: [{ filename: 'src/x.js', status: 'modified', additions: 3, deletions: 1, changes: 4, patch: '+'.repeat(2000) }] });
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    await assert.rejects(() => service.compareWithDefault(123, 'not-a-sha'), /SHA/i);
    const result = await service.compareWithDefault(123, head);
    assert.equal(result.base, 'main');
    assert.equal(result.head, head);
    assert.equal(result.aheadBy, 2);
    assert.ok(result.files[0].patch.length <= 1200);
  });
});

test('GitHub PR detail exposes files and checks with bounded pagination', async () => {
  const sha = 'd'.repeat(40);
  await withFetch(async (url) => {
    const value = String(url);
    if (value === 'https://api.github.com/repositories/123') return json(repo);
    if (value === `${repoUrl}/pulls/18`) return json({ number: 18, title: 'feat', state: 'open', merged: false, user: { login: 'dev' }, body: 'body', html_url: 'https://github.com/x/pull/18', head: { ref: 'feat/x', sha }, base: { ref: 'main' }, additions: 10, deletions: 2, changed_files: 1 });
    if (value === `${repoUrl}/pulls/18/files?per_page=20&page=100`) return json([{ filename: 'src/x.js', status: 'modified', additions: 10, deletions: 2, changes: 12, patch: '+'.repeat(2000) }]);
    if (value === `${repoUrl}/commits/${sha}/check-runs?per_page=20&page=100`) return json({ check_runs: [{ id: 7, name: 'CI', status: 'completed', conclusion: 'success', html_url: 'https://github.com/check/7' }] });
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    const pr = await service.getPullRequest(123, 18);
    assert.equal(pr.headSha, sha);
    const files = await service.listPullRequestFiles(123, 18, { perPage: 999, page: 999 });
    assert.ok(files[0].patch.length <= 1200);
    const checks = await service.listCommitChecks(123, sha, { perPage: 999, page: 999 });
    assert.deepEqual(checks[0], { id: 7, name: 'CI', status: 'completed', conclusion: 'success', url: 'https://github.com/check/7' });
  });
});

test('GitHub issues exclude pull requests and releases are source-backed', async () => {
  await withFetch(async (url) => {
    const value = String(url);
    if (value === 'https://api.github.com/repositories/123') return json(repo);
    if (value === `${repoUrl}/issues?state=all&per_page=10&page=2`) return json([{ number: 4, title: 'bug', state: 'open', user: { login: 'u' }, comments: 2, html_url: 'https://github.com/i/4' }, { number: 5, title: 'pr', pull_request: {}, state: 'open' }]);
    if (value === `${repoUrl}/releases?per_page=10&page=2`) return json([{ id: 6, tag_name: 'v1.2.0', name: 'Release 1.2', draft: false, prerelease: false, published_at: '2026-10-03T00:00:00Z', html_url: 'https://github.com/r/6' }]);
    return json({ message: 'Not Found' }, 404);
  }, async () => {
    const service = new GitHubService('token');
    const issues = await service.listIssues(123, { page: 2 });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].number, 4);
    const releases = await service.listReleases(123, { page: 2 });
    assert.equal(releases[0].tag, 'v1.2.0');
  });
});
