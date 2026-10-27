import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService } from '../src/github.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';

function makeMenu() {
  const calls = [];
  return {
    calls,
    async getReposListView() {
      calls.push('/repos');
      return { text: 'repos', reply_markup: { inline_keyboard: [] } };
    },
    async renderByCallback(data) {
      calls.push(data);
      return { text: `legacy:${data}`, reply_markup: { inline_keyboard: [] } };
    }
  };
}

function makeWorkspaces() {
  const calls = [];
  const refs = new Map();
  const workspaces = new Map();
  let refCounter = 0;
  return {
    calls,
    refs,
    workspaces,
    async createNavigationRefs({ ownerId, refs: input }) {
      calls.push(['createNavigationRefs', ownerId, structuredClone(input)]);
      return input.map((ref) => {
        refCounter += 1;
        const refId = `R${String(refCounter).padStart(9, '0')}`;
        refs.set(`${ownerId}:${refId}`, structuredClone(ref));
        return { refId };
      });
    },
    async resolveNavigationRef({ ownerId, refId }) {
      calls.push(['resolveNavigationRef', ownerId, refId]);
      return refs.get(`${ownerId}:${refId}`) || null;
    },
    async createWorkspace(payload) {
      calls.push([
        'createWorkspace',
        payload.ownerId,
        payload.path,
        payload.baseHeadSha
      ]);
      const workspace = {
        id: 'W000000001',
        state: 'DRAFT',
        draftText: payload.originalText,
        ...payload
      };
      workspaces.set(`${payload.ownerId}:${workspace.id}`, workspace);
      return workspace;
    },
    async getWorkspace({ ownerId, workspaceId }) {
      calls.push(['getWorkspace', ownerId, workspaceId]);
      return workspaces.get(`${ownerId}:${workspaceId}`) || null;
    }
  };
}

function makeGitHub({
  archived = false,
  fileText = 'export const ok = true;\n',
  filePath = 'src/deep/really-long-file-name-for-mobile-editor.js'
} = {}) {
  const calls = [];
  const headSha = 'a'.repeat(40);
  const treeSha = 'b'.repeat(40);
  const blobSha = 'c'.repeat(40);
  return {
    calls,
    headSha,
    treeSha,
    blobSha,
    async getRepository(repoId) {
      calls.push(['getRepository', Number(repoId)]);
      return {
        id: String(repoId),
        name: 'demo',
        fullName: 'davood/demo',
        defaultBranch: 'main',
        archived
      };
    },
    async listFiles(repoId, path = '', options = {}) {
      calls.push(['listFiles', Number(repoId), path, options.ref || null]);
      if (path === 'src/deep') {
        return [
          {
            name: 'nested.js',
            path: 'src/deep/nested.js',
            type: 'file',
            size: 20,
            sha: 'd'.repeat(40)
          }
        ];
      }
      return [
        {
          name: 'deep',
          path: 'src/deep',
          type: 'dir',
          size: 0,
          sha: 'e'.repeat(40)
        },
        {
          name: 'really-long-file-name-for-mobile-editor.js',
          path: filePath,
          type: 'file',
          size: new TextEncoder().encode(fileText).byteLength,
          sha: blobSha
        }
      ];
    },
    async getBranchSnapshot(repoId, branch) {
      calls.push(['getBranchSnapshot', Number(repoId), branch]);
      return { branch, headSha, treeSha };
    },
    async getFileAtRef(repoId, path, ref) {
      calls.push(['getFileAtRef', Number(repoId), path, ref]);
      return {
        path,
        sha: path === filePath ? blobSha : 'd'.repeat(40),
        size: new TextEncoder().encode(fileText).byteLength,
        encoding: 'utf-8',
        content: fileText
      };
    }
  };
}

function flatten(view) {
  return view.reply_markup?.inline_keyboard?.flat() || [];
}

test('exact files callback resolves side-effect-free then renders path-safe short navigation refs', async () => {
  const github = makeGitHub();
  const workspaces = makeWorkspaces();
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github, menu, workspaces });

  const route = plugin.resolveCallback('files:123', { ownerId: '42' });
  assert.equal(route.actionId, 'github.files.list');
  assert.deepEqual(github.calls, []);
  assert.deepEqual(workspaces.calls, []);

  const view = await route.execute();
  const buttons = flatten(view).filter((button) =>
    button.callback_data?.startsWith('wnav:')
  );
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.match(button.callback_data, /^wnav:[A-Za-z0-9_-]{10}$/);
    assert.ok(new TextEncoder().encode(button.callback_data).byteLength <= 64);
    assert.doesNotMatch(button.callback_data, /src|really-long|\.js/);
  }
  assert.equal(menu.calls.length, 0);
});

test('nested directory resolves through short ref and preserves the full server-side path', async () => {
  const github = makeGitHub();
  const workspaces = makeWorkspaces();
  const plugin = createGitHubPlugin({ github, menu: makeMenu(), workspaces });
  const root = await plugin
    .resolveCallback('files:123', { ownerId: '42' })
    .execute();
  const dirCallback = flatten(root).find((button) =>
    button.text?.includes('deep')
  )?.callback_data;
  assert.match(dirCallback, /^wnav:/);

  github.calls.length = 0;
  workspaces.calls.length = 0;
  const route = plugin.resolveCallback(dirCallback, { ownerId: '42' });
  assert.equal(route.actionId, 'github.workspace.navigate');
  assert.deepEqual(github.calls, []);
  assert.deepEqual(workspaces.calls, []);
  const nested = await route.execute();
  assert.ok(
    flatten(nested).some((button) => /^wnav:/.test(button.callback_data || ''))
  );
  assert.ok(
    github.calls.some(
      (call) => call[0] === 'listFiles' && call[2] === 'src/deep'
    )
  );
});

test('eligible file preview including README shows Edit while risky or truly oversized content stays readable with explicit disabled reason', async () => {
  for (const fixture of [
    { path: 'src/app.js', text: 'console.log(1);\n', editable: true },
    {
      path: 'README.md',
      text: `# Nexa Dev Bot\n\n${'x'.repeat(8200)}`,
      editable: true
    },
    {
      path: '.env.production',
      text: 'NOT_A_REAL_SECRET=value\n',
      editable: false,
      reason: /sensitive/i
    },
    {
      path: 'large.txt',
      text: 'x'.repeat(20001),
      editable: false,
      reason: /20,000|20000/
    },
    {
      path: 'asset.txt',
      text: 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 9\n',
      editable: false,
      reason: /LFS/i
    }
  ]) {
    const github = makeGitHub({
      fileText: fixture.text,
      filePath: fixture.path
    });
    const workspaces = makeWorkspaces();
    const plugin = createGitHubPlugin({ github, menu: makeMenu(), workspaces });
    const root = await plugin
      .resolveCallback('files:123', { ownerId: '42' })
      .execute();
    const fileCallback = flatten(root).find(
      (button) =>
        button.callback_data?.startsWith('wnav:') &&
        !button.text?.includes('deep')
    )?.callback_data;
    const view = await plugin
      .resolveCallback(fileCallback, { ownerId: '42' })
      .execute();
    assert.match(view.text, /پیش.?نمایش|فایل/i);
    const edit = flatten(view).find((button) =>
      button.callback_data?.startsWith('wedit:')
    );
    if (fixture.editable) {
      assert.ok(edit, fixture.path);
    } else {
      assert.equal(edit, undefined, fixture.path);
      assert.match(view.text, fixture.reason);
    }
  }
});

test('wedit pins default-branch snapshot and exact file before creating a durable draft', async () => {
  const github = makeGitHub({ filePath: 'src/app.js', fileText: 'before\n' });
  const workspaces = makeWorkspaces();
  const plugin = createGitHubPlugin({ github, menu: makeMenu(), workspaces });
  const root = await plugin
    .resolveCallback('files:123', { ownerId: '42' })
    .execute();
  const fileCallback = flatten(root).find(
    (button) =>
      button.callback_data?.startsWith('wnav:') &&
      !button.text?.includes('deep')
  )?.callback_data;
  const fileView = await plugin
    .resolveCallback(fileCallback, { ownerId: '42' })
    .execute();
  const editCallback = flatten(fileView).find((button) =>
    button.callback_data?.startsWith('wedit:')
  )?.callback_data;

  github.calls.length = 0;
  workspaces.calls.length = 0;
  const route = plugin.resolveCallback(editCallback, { ownerId: '42' });
  assert.equal(route.actionId, 'github.workspace.create');
  assert.deepEqual(github.calls, []);
  assert.deepEqual(workspaces.calls, []);
  const draftView = await route.execute();

  const snapshotIndex = github.calls.findIndex(
    (call) => call[0] === 'getBranchSnapshot'
  );
  const fileIndex = github.calls.findIndex(
    (call) => call[0] === 'getFileAtRef'
  );
  const createCall = workspaces.calls.find(
    (call) => call[0] === 'createWorkspace'
  );
  assert.ok(snapshotIndex >= 0 && fileIndex > snapshotIndex);
  assert.deepEqual(github.calls[fileIndex].slice(2), [
    'src/app.js',
    github.headSha
  ]);
  assert.deepEqual(createCall, [
    'createWorkspace',
    '42',
    'src/app.js',
    github.headSha
  ]);
  assert.match(draftView.text, /Draft|پیش.?نویس/i);
  assert.ok(
    flatten(draftView).some(
      (button) => button.callback_data === 'ws:W000000001'
    )
  );
});

test('archived repository cannot create an editable workspace', async () => {
  const github = makeGitHub({ archived: true, filePath: 'src/app.js' });
  const workspaces = makeWorkspaces();
  const plugin = createGitHubPlugin({ github, menu: makeMenu(), workspaces });
  const root = await plugin
    .resolveCallback('files:123', { ownerId: '42' })
    .execute();
  const fileCallback = flatten(root).find(
    (button) =>
      button.callback_data?.startsWith('wnav:') &&
      !button.text?.includes('deep')
  )?.callback_data;
  const fileView = await plugin
    .resolveCallback(fileCallback, { ownerId: '42' })
    .execute();
  const editCallback = flatten(fileView).find((button) =>
    button.callback_data?.startsWith('wedit:')
  )?.callback_data;
  assert.equal(editCallback, undefined);
  assert.match(fileView.text, /archiv|آرشیو/i);
  assert.equal(
    workspaces.calls.some((call) => call[0] === 'createWorkspace'),
    false
  );
});

test('legacy tree blob and path-bearing files callbacks remain on MenuManager path', async () => {
  const github = makeGitHub();
  const workspaces = makeWorkspaces();
  const menu = makeMenu();
  const plugin = createGitHubPlugin({ github, menu, workspaces });

  for (const callback of [
    `tree:123:${'a'.repeat(40)}`,
    `blob:123:${'b'.repeat(40)}`,
    'files:123:src/deep'
  ]) {
    const route = plugin.resolveCallback(callback, { ownerId: '42' });
    const view = await route.execute();
    assert.equal(view.text, `legacy:${callback}`);
  }
});

test('workspace READ actions are declared and all short callback families fit Telegram limit', () => {
  const plugin = createGitHubPlugin({
    github: makeGitHub(),
    menu: makeMenu(),
    workspaces: makeWorkspaces()
  });
  for (const actionId of [
    'github.workspace.navigate',
    'github.workspace.create',
    'github.workspace.view',
    'github.workspace.input.prepare',
    'github.workspace.diff',
    'github.workspace.ready',
    'github.workspace.cancel'
  ]) {
    assert.equal(plugin.manifest.actions[actionId]?.risk, 'READ', actionId);
  }
  for (const callback of [
    'wnav:R123456789',
    'wedit:R123456789',
    'ws:W123456789',
    'wtext:W123456789',
    'wmsg:W123456789',
    'wdiff:W123456789',
    'wready:W123456789',
    'wcancel:W123456789'
  ]) {
    assert.ok(new TextEncoder().encode(callback).byteLength <= 64, callback);
  }
});

test('GitHubService reads pinned branch snapshot and UTF-8 file at full SHA', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  const headSha = 'a'.repeat(40);
  const treeSha = 'b'.repeat(40);
  const blobSha = 'c'.repeat(40);
  globalThis.fetch = async (url, options = {}) => {
    seen.push([String(url), options.method || 'GET']);
    const value = String(url);
    if (value.endsWith('/repositories/123'))
      return Response.json({
        id: 123,
        name: 'demo',
        full_name: 'davood/demo',
        default_branch: 'main'
      });
    if (value.endsWith('/repos/davood/demo/git/ref/heads/main'))
      return Response.json({ object: { sha: headSha } });
    if (value.endsWith(`/repos/davood/demo/git/commits/${headSha}`))
      return Response.json({ sha: headSha, tree: { sha: treeSha } });
    if (
      value.endsWith(`/repos/davood/demo/contents/src/app.js?ref=${headSha}`)
    ) {
      return Response.json({
        type: 'file',
        path: 'src/app.js',
        sha: blobSha,
        size: 6,
        encoding: 'base64',
        content: btoa('hello\n')
      });
    }
    return new Response('unexpected', { status: 500 });
  };
  try {
    const github = new GitHubService('token', 'davood');
    assert.deepEqual(await github.getBranchSnapshot(123, 'main'), {
      branch: 'main',
      headSha,
      treeSha
    });
    assert.deepEqual(await github.getFileAtRef(123, 'src/app.js', headSha), {
      path: 'src/app.js',
      sha: blobSha,
      size: 6,
      encoding: 'utf-8',
      content: 'hello\n'
    });
    assert.ok(
      seen.some(([url]) => url.endsWith(`/contents/src/app.js?ref=${headSha}`))
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
