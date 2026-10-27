import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';

const REPO = 123;
const HEAD = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const BLOB1 = 'c'.repeat(40);
const BLOB2 = 'd'.repeat(40);
const COMMIT = 'e'.repeat(40);
const TIMESTAMP = '2026-10-03T09:00:00.000Z';

function jsonBody(options = {}) {
  return options.body ? JSON.parse(options.body) : null;
}

function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = original;
    });
}

function repoResponse(url) {
  if (String(url).endsWith('/repositories/123')) {
    return Response.json({
      id: REPO,
      name: 'demo',
      full_name: 'davood/demo',
      default_branch: 'main'
    });
  }
  return null;
}

test('getGitRef encodes slash branch names and only 404 may become an allowed missing ref', async () => {
  const seen = [];
  await withFetch(
    async (url, options = {}) => {
      const repo = repoResponse(url);
      if (repo) return repo;
      seen.push([String(url), options.method || 'GET']);
      if (String(url).endsWith('/git/ref/heads/feature/mobile')) {
        return Response.json({
          ref: 'refs/heads/feature/mobile',
          object: { type: 'commit', sha: HEAD }
        });
      }
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    },
    async () => {
      const github = new GitHubService('token', 'davood');
      assert.deepEqual(await github.getGitRef(REPO, 'feature/mobile'), {
        branch: 'feature/mobile',
        sha: HEAD
      });
      assert.equal(
        await github.getGitRef(REPO, 'missing/branch', { allowMissing: true }),
        null
      );
      await assert.rejects(
        () => github.getGitRef(REPO, 'missing/branch'),
        /404/
      );
    }
  );
  assert.ok(
    seen.some(
      ([url, method]) =>
        url.endsWith('/git/ref/heads/feature/mobile') && method === 'GET'
    )
  );
});

test('getGitRef still propagates non-404 provider errors and validates returned full SHA', async () => {
  await withFetch(
    async (url) => {
      const repo = repoResponse(url);
      if (repo) return repo;
      return new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' }
      });
    },
    async () => {
      const github = new GitHubService('token', 'davood');
      await assert.rejects(
        () => github.getGitRef(REPO, 'main', { allowMissing: true }),
        /403 Forbidden/
      );
    }
  );

  await withFetch(
    async (url) => {
      const repo = repoResponse(url);
      if (repo) return repo;
      return Response.json({
        ref: 'refs/heads/main',
        object: { sha: 'short' }
      });
    },
    async () => {
      const github = new GitHubService('token', 'davood');
      await assert.rejects(() => github.getGitRef(REPO, 'main'), /SHA/);
    }
  );
});

test('Git Data primitives send exact blob tree commit and branch-ref requests', async () => {
  const requests = [];
  await withFetch(
    async (url, options = {}) => {
      const repo = repoResponse(url);
      if (repo) return repo;
      requests.push({
        url: String(url),
        method: options.method || 'GET',
        body: jsonBody(options)
      });
      const value = String(url);
      if (value.endsWith('/git/blobs'))
        return Response.json({ sha: BLOB1 }, { status: 201 });
      if (value.endsWith('/git/trees'))
        return Response.json({ sha: TREE }, { status: 201 });
      if (value.endsWith('/git/commits'))
        return Response.json({ sha: COMMIT }, { status: 201 });
      if (value.endsWith('/git/refs'))
        return Response.json(
          { ref: 'refs/heads/nexa/edit-W123456789', object: { sha: COMMIT } },
          { status: 201 }
        );
      return new Response('unexpected', { status: 500 });
    },
    async () => {
      const github = new GitHubService('token', 'davood');
      assert.deepEqual(await github.createGitBlob(REPO, 'hello\n'), {
        sha: BLOB1
      });
      assert.deepEqual(
        await github.createGitTree(REPO, {
          baseTreeSha: HEAD,
          entries: [
            { path: 'src/app.js', mode: '100644', type: 'blob', sha: BLOB1 },
            { path: 'src/other.js', mode: '100644', type: 'blob', sha: BLOB2 }
          ]
        }),
        { sha: TREE }
      );
      assert.deepEqual(
        await github.createGitCommit(REPO, {
          message: 'edit app',
          treeSha: TREE,
          parentSha: HEAD,
          timestamp: TIMESTAMP
        }),
        { sha: COMMIT }
      );
      assert.deepEqual(
        await github.createGitBranchRef(REPO, {
          branch: 'nexa/edit-W123456789',
          sha: COMMIT
        }),
        { ref: 'refs/heads/nexa/edit-W123456789', sha: COMMIT }
      );
    }
  );

  assert.deepEqual(requests, [
    {
      url: 'https://api.github.com/repos/davood/demo/git/blobs',
      method: 'POST',
      body: { content: 'hello\n', encoding: 'utf-8' }
    },
    {
      url: 'https://api.github.com/repos/davood/demo/git/trees',
      method: 'POST',
      body: {
        base_tree: HEAD,
        tree: [
          { path: 'src/app.js', mode: '100644', type: 'blob', sha: BLOB1 },
          { path: 'src/other.js', mode: '100644', type: 'blob', sha: BLOB2 }
        ]
      }
    },
    {
      url: 'https://api.github.com/repos/davood/demo/git/commits',
      method: 'POST',
      body: {
        message: 'edit app',
        tree: TREE,
        parents: [HEAD],
        author: {
          name: 'Nexa Dev Bot',
          email: 'nexa-dev-bot@users.noreply.github.com',
          date: TIMESTAMP
        },
        committer: {
          name: 'Nexa Dev Bot',
          email: 'nexa-dev-bot@users.noreply.github.com',
          date: TIMESTAMP
        }
      }
    },
    {
      url: 'https://api.github.com/repos/davood/demo/git/refs',
      method: 'POST',
      body: { ref: 'refs/heads/nexa/edit-W123456789', sha: COMMIT }
    }
  ]);
});

test('Git Data primitives validate all full SHAs and preserve deterministic retry bodies', async () => {
  const commitBodies = [];
  await withFetch(
    async (url, options = {}) => {
      const repo = repoResponse(url);
      if (repo) return repo;
      if (String(url).endsWith('/git/commits')) {
        commitBodies.push(jsonBody(options));
        return Response.json({ sha: COMMIT }, { status: 201 });
      }
      return Response.json({ sha: TREE }, { status: 201 });
    },
    async () => {
      const github = new GitHubService('token', 'davood');
      await assert.rejects(
        () => github.createGitTree(REPO, { baseTreeSha: 'short', entries: [] }),
        /SHA/
      );
      await assert.rejects(
        () =>
          github.createGitTree(REPO, {
            baseTreeSha: TREE,
            entries: [
              { path: 'a.js', mode: '100644', type: 'blob', sha: 'short' }
            ]
          }),
        /SHA/
      );
      await assert.rejects(
        () =>
          github.createGitCommit(REPO, {
            message: 'x',
            treeSha: 'short',
            parentSha: HEAD,
            timestamp: TIMESTAMP
          }),
        /SHA/
      );
      await assert.rejects(
        () =>
          github.createGitCommit(REPO, {
            message: 'x',
            treeSha: TREE,
            parentSha: 'short',
            timestamp: TIMESTAMP
          }),
        /SHA/
      );
      await assert.rejects(
        () =>
          github.createGitBranchRef(REPO, {
            branch: 'nexa/edit-W123456789',
            sha: 'short'
          }),
        /SHA/
      );

      const input = {
        message: 'same material',
        treeSha: TREE,
        parentSha: HEAD,
        timestamp: TIMESTAMP
      };
      await github.createGitCommit(REPO, input);
      await github.createGitCommit(REPO, input);
    }
  );
  assert.equal(commitBodies.length, 2);
  assert.deepEqual(commitBodies[0], commitBodies[1]);
});

test('provider 409 and 422 remain explicit and an existing different target ref never triggers an update or force endpoint', async () => {
  for (const status of [409, 422]) {
    await withFetch(
      async (url, options = {}) => {
        const repo = repoResponse(url);
        if (repo) return repo;
        return new Response(JSON.stringify({ message: 'Reference conflict' }), {
          status,
          headers: { 'content-type': 'application/json' }
        });
      },
      async () => {
        const github = new GitHubService('token', 'davood');
        await assert.rejects(
          () =>
            github.createGitBranchRef(REPO, {
              branch: 'nexa/edit-W123456789',
              sha: COMMIT
            }),
          new RegExp(String(status))
        );
      }
    );
  }

  const calls = [];
  await withFetch(
    async (url, options = {}) => {
      const repo = repoResponse(url);
      if (repo) return repo;
      calls.push({ url: String(url), method: options.method || 'GET' });
      if (String(url).endsWith('/git/ref/heads/nexa/edit-W123456789')) {
        return Response.json({ object: { sha: HEAD } });
      }
      return new Response('unexpected', { status: 500 });
    },
    async () => {
      const github = new GitHubService('token', 'davood');
      const existing = await github.getGitRef(REPO, 'nexa/edit-W123456789', {
        allowMissing: true
      });
      assert.deepEqual(existing, { branch: 'nexa/edit-W123456789', sha: HEAD });
      assert.notEqual(existing.sha, COMMIT);
    }
  );
  assert.deepEqual(calls, [
    {
      url: 'https://api.github.com/repos/davood/demo/git/ref/heads/nexa/edit-W123456789',
      method: 'GET'
    }
  ]);
});
