import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { githubPluginManifest } from '../src/plugins/github/manifest.js';

const HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('PR merge is a DESTRUCTIVE GitHub action', () => {
  assert.deepEqual(githubPluginManifest.actions['github.pull_request.merge'], { risk: 'DESTRUCTIVE' });
});

test('mergePullRequest requires an exact full PR head SHA', async () => {
  const github = new GitHubService('token', 'owner');
  await assert.rejects(github.mergePullRequest('repo', 42, { expectedHeadSha: 'abc123', mergeMethod: 'squash' }), /head sha|required|expected|invalid/i);
});

test('mergePullRequest rejects missing exact-head binding before provider mutation', async () => {
  const github = new GitHubService('token', 'owner');
  await assert.rejects(github.mergePullRequest('repo', 42, { mergeMethod: 'squash' }), /head sha|required|expected/i);
});

test('mergePullRequest only accepts supported merge methods', async () => {
  const github = new GitHubService('token', 'owner');
  await assert.rejects(github.mergePullRequest('repo', 42, { expectedHeadSha: HEAD_SHA, mergeMethod: 'octopus' }), /merge method|unsupported/i);
});
