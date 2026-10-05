import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { githubPluginManifest } from '../src/plugins/github/manifest.js';

test('PR merge is a DESTRUCTIVE GitHub action', () => {
  assert.deepEqual(githubPluginManifest.actions['github.pull_request.merge'], { risk: 'DESTRUCTIVE' });
});

test('mergePullRequest binds mutation to the expected PR head SHA', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ merged: true, sha: 'merge-sha', message: 'Pull Request successfully merged' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  const github = new GitHubService({ token: 'token', fetchImpl });
  const result = await github.mergePullRequest('owner/repo', 42, {
    expectedHeadSha: 'abc123',
    mergeMethod: 'squash'
  });
  assert.equal(result.merged, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /repos\/owner\/repo\/pulls\/42\/merge$/);
  assert.equal(calls[0].options.method, 'PUT');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.sha, 'abc123');
  assert.equal(body.merge_method, 'squash');
});

test('mergePullRequest rejects missing exact-head binding before provider mutation', async () => {
  let called = false;
  const github = new GitHubService({ token: 'token', fetchImpl: async () => { called = true; throw new Error('must not call'); } });
  await assert.rejects(
    github.mergePullRequest('owner/repo', 42, { mergeMethod: 'squash' }),
    /head sha|required|expected/i
  );
  assert.equal(called, false);
});

test('mergePullRequest only accepts supported merge methods', async () => {
  const github = new GitHubService({ token: 'token', fetchImpl: async () => { throw new Error('must not call'); } });
  await assert.rejects(
    github.mergePullRequest('owner/repo', 42, { expectedHeadSha: 'abc123', mergeMethod: 'octopus' }),
    /merge method|unsupported/i
  );
});
