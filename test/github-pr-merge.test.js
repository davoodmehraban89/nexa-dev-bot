import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { githubPluginManifest } from '../src/plugins/github/manifest.js';
import { ApprovalService } from '../src/core/approval.js';
const HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
function replayStore() {
  const used = new Set(); const payloads = new Map();
  return {
    async put({ ownerId, nonce, payload }) { payloads.set(`${ownerId}:${nonce}`, payload); return true; },
    async peek({ ownerId, nonce }) { return payloads.get(`${ownerId}:${nonce}`) || null; },
    async consume({ ownerId, nonce }) { const key = `${ownerId}:${nonce}`; if (used.has(key)) return false; used.add(key); return true; }
  };
}
test('PR merge is a DESTRUCTIVE GitHub action', () => { assert.deepEqual(githubPluginManifest.actions['github.pull_request.merge'], { risk: 'DESTRUCTIVE' }); });
test('mergePullRequest requires an exact full PR head SHA', async () => { const github = new GitHubService('token', 'owner'); await assert.rejects(github.mergePullRequest('repo', 42, { expectedHeadSha: 'abc123', mergeMethod: 'squash' }), /head sha|required|expected|invalid/i); });
test('mergePullRequest rejects missing exact-head binding before provider mutation', async () => { const github = new GitHubService('token', 'owner'); await assert.rejects(github.mergePullRequest('repo', 42, { mergeMethod: 'squash' }), /head sha|required|expected/i); });
test('mergePullRequest only accepts supported merge methods', async () => { const github = new GitHubService('token', 'owner'); await assert.rejects(github.mergePullRequest('repo', 42, { expectedHeadSha: HEAD_SHA, mergeMethod: 'octopus' }), /merge method|unsupported/i); });
test('destructive merge approval is owner/action/risk/repo/PR/head bound and replay-safe', async () => {
  const service = new ApprovalService({ secret: 'test-secret', now: () => 1700000000000, replayStore: replayStore() });
  const token = await service.issue({ pluginId: 'github', actionId: 'github.pull_request.merge', risk: 'DESTRUCTIVE', ownerId: '42', input: { repoId: 7, prNumber: 39, headSha: HEAD_SHA } });
  assert.ok(`approve:${token}`.length <= 64);
  const payload = await service.consume(token, { ownerId: '42', pluginId: 'github', actionId: 'github.pull_request.merge', risk: 'DESTRUCTIVE' });
  assert.deepEqual(payload.input, { repoId: 7, prNumber: 39, headSha: HEAD_SHA });
  await assert.rejects(() => service.consume(token, { ownerId: '42' }), /already used/i);
});
