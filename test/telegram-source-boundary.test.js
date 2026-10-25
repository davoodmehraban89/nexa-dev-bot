import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceController } from '../src/plugins/github/workspace.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';
import { MenuManager } from '../src/menu.js';
import { handleWorkspaceEditorRequest } from '../src/workspace-editor.js';
import { signedWebAppData } from './helpers/webapp-auth.js';

const source = 'SOURCE_BOUNDARY_SENTINEL';
const changed = 'DRAFT_BOUNDARY_SENTINEL';
const sha = 'a'.repeat(40);
const repo = {
  id: '123',
  name: 'demo',
  fullName: 'owner/demo',
  defaultBranch: 'main'
};
const workspace = {
  id: 'W000000001',
  repoId: 123,
  path: 'README.md',
  originalText: source,
  draftText: changed,
  state: 'DRAFT',
  baseHeadSha: sha
};
function stores() {
  return {
    getWorkspace: async ({ ownerId }) => (ownerId === '42' ? workspace : null),
    resolveNavigationRef: async ({ ownerId }) =>
      ownerId === '42' ? { repoId: 123, path: 'README.md', type: 'file' } : null
  };
}
function github() {
  return {
    getRepository: async () => repo,
    getBranchSnapshot: async () => ({ headSha: sha, treeSha: 'b'.repeat(40) }),
    getFileAtRef: async () => ({
      path: 'README.md',
      content: source,
      size: source.length,
      sha
    }),
    getBlob: async () => ({
      content: btoa(source),
      encoding: 'base64',
      size: source.length
    }),
    listPullRequestFiles: async () => [
      {
        filename: 'README.md',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `-${source}\n+${changed}`
      }
    ],
    getWorkflowJob: async () => ({
      id: 4,
      name: 'test',
      status: 'completed',
      conclusion: 'failure',
      htmlUrl: 'https://github.com/owner/demo/actions/runs/1/job/4'
    }),
    getWorkflowJobLog: async () => ({ text: source, truncated: false })
  };
}
const assertNoSource = (view) =>
  assert.doesNotMatch(
    JSON.stringify(view),
    /SOURCE_BOUNDARY_SENTINEL|DRAFT_BOUNDARY_SENTINEL/
  );

test('file Telegram view contains metadata and authenticated Mini App link, never source', async () => {
  const controller = createWorkspaceController({
    github: github(),
    workspaces: stores(),
    editorUrl: 'https://app.test/workspace/editor'
  });
  const view = await controller
    .resolveCallback('wnav:R000000001', { ownerId: '42' })
    .execute();
  assertNoSource(view);
  const link = view.reply_markup.inline_keyboard
    .flat()
    .find((button) => button.web_app);
  assert.equal(
    new URL(link.web_app.url).searchParams.get('refId'),
    'R000000001'
  );
});

test('diff Telegram view contains counts and Mini App diff link, never source lines', async () => {
  const controller = createWorkspaceController({
    github: github(),
    workspaces: stores(),
    editorUrl: 'https://app.test/workspace/editor'
  });
  const view = await controller
    .resolveCallback('wdiff:W000000001', { ownerId: '42' })
    .execute();
  assertNoSource(view);
  assert.match(view.text, /\+1.*-1/);
  const link = view.reply_markup.inline_keyboard
    .flat()
    .find((button) => button.web_app);
  assert.equal(new URL(link.web_app.url).searchParams.get('view'), 'diff');
});

test('legacy blob, PR patch and job-log callbacks cannot forward source into Telegram', async () => {
  assertNoSource(await new MenuManager(github()).getBlobView(123, sha));
  const plugin = createGitHubPlugin({ github: github(), menu: {} });
  for (const callback of ['prfiles:123:7:1', 'joblog:123:4']) {
    assertNoSource(
      await plugin.resolveCallback(callback, { ownerId: '42' }).execute()
    );
  }
});

test('only authenticated owner can read pinned file ref in Mini App without creating a workspace', async () => {
  const botToken = 'test-only-token';
  const headers = {
    'x-telegram-init-data': await signedWebAppData({ botToken })
  };
  const options = {
    workspaces: stores(),
    github: github(),
    botToken,
    ownerId: '42'
  };
  const response = await handleWorkspaceEditorRequest(
    new Request('https://app.test/workspace/api/editor?refId=R000000001', {
      headers
    }),
    options
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.workspace.draftText, source);
  assert.equal(body.workspace.readOnly, true);
  const bad = {
    'x-telegram-init-data': await signedWebAppData({ botToken, userId: 99 })
  };
  assert.equal(
    (
      await handleWorkspaceEditorRequest(
        new Request('https://app.test/workspace/api/editor?refId=R000000001', {
          headers: bad
        }),
        options
      )
    ).status,
    403
  );
});

test('authenticated Mini App diff supplies exact counts and text with no provider write', async () => {
  const botToken = 'test-only-token';
  const headers = {
    'x-telegram-init-data': await signedWebAppData({ botToken })
  };
  const response = await handleWorkspaceEditorRequest(
    new Request(
      'https://app.test/workspace/api/editor?workspaceId=W000000001&view=diff',
      { headers }
    ),
    { workspaces: stores(), botToken, ownerId: '42' }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.workspace.readOnly, true);
  assert.equal(body.diff.additions, 1);
  assert.equal(body.diff.deletions, 1);
  assert.match(
    body.diff.text,
    /\+DRAFT_BOUNDARY_SENTINEL\n-SOURCE_BOUNDARY_SENTINEL/
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('Mini App preview rejects expired references and sensitive files', async () => {
  const botToken = 'test-only-token';
  const headers = {
    'x-telegram-init-data': await signedWebAppData({ botToken })
  };
  const request = () =>
    new Request('https://app.test/workspace/api/editor?refId=R000000001', {
      headers
    });
  const absent = { ...stores(), resolveNavigationRef: async () => null };
  assert.equal(
    (
      await handleWorkspaceEditorRequest(request(), {
        workspaces: absent,
        github: github(),
        botToken,
        ownerId: '42'
      })
    ).status,
    404
  );
  const secretFile = {
    ...github(),
    getFileAtRef: async () => ({
      path: '.env.production',
      content: source,
      size: source.length
    })
  };
  const denied = await handleWorkspaceEditorRequest(request(), {
    workspaces: stores(),
    github: secretFile,
    botToken,
    ownerId: '42'
  });
  assert.equal(denied.status, 422);
  assert.doesNotMatch(await denied.text(), /SOURCE_BOUNDARY_SENTINEL/);
});

test('preview provider error text cannot become a client validation error', async () => {
  const botToken = 'test-only-token';
  const headers = {
    'x-telegram-init-data': await signedWebAppData({ botToken })
  };
  const provider = {
    ...github(),
    getFileAtRef: async () => {
      throw new Error('user path github_pat_SECRET_SENTINEL');
    }
  };
  const response = await handleWorkspaceEditorRequest(
    new Request('https://app.test/workspace/api/editor?refId=R000000001', {
      headers
    }),
    { workspaces: stores(), github: provider, botToken, ownerId: '42' }
  );
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /SECRET_SENTINEL|user path/);
});

test('Mini App reports complex diffs explicitly without approximate content or counts', async () => {
  const botToken = 'test-only-token';
  const headers = {
    'x-telegram-init-data': await signedWebAppData({ botToken })
  };
  const large = {
    ...workspace,
    originalText: 'a\n'.repeat(600),
    draftText: 'b\n'.repeat(600)
  };
  const workspaces = { getWorkspace: async () => large };
  const response = await handleWorkspaceEditorRequest(
    new Request(
      'https://app.test/workspace/api/editor?workspaceId=W000000001&view=diff',
      { headers }
    ),
    { workspaces, botToken, ownerId: '42' }
  );
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, 'DIFF_COMPLEXITY_LIMIT');
  assert.match(body.error, /کوچک‌تر/);
  assert.equal(body.diff, undefined);
});
