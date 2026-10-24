import test from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';
import { PluginRouter } from '../src/core/router.js';
import { PluginRegistry } from '../src/core/plugin-registry.js';
import { ActionPolicy } from '../src/core/action-policy.js';
import { AuditLogger } from '../src/core/audit.js';
import { createGitHubPlugin } from '../src/plugins/github/plugin.js';
import { digestText } from '../src/core/workspace-policy.js';

const OWNER = '42';
const WORKSPACE_ID = 'W000000001';

function flatten(view) {
  return view?.reply_markup?.inline_keyboard?.flat() || [];
}

function makeMenu() {
  return {
    async getReposListView() {
      return { text: 'repos', reply_markup: { inline_keyboard: [] } };
    },
    async renderByCallback(data) {
      return { text: `legacy:${data}`, reply_markup: { inline_keyboard: [] } };
    }
  };
}

function makeGitHub() {
  const calls = [];
  return {
    calls,
    async getRepository(repoId) {
      calls.push(['getRepository', Number(repoId)]);
      return {
        id: String(repoId),
        name: 'demo',
        fullName: 'davood/demo',
        defaultBranch: 'main',
        archived: false
      };
    }
  };
}

function makeWorkspaces() {
  const calls = [];
  let pending = null;
  let intentCounter = 0;
  const intents = new Map();
  const workspace = {
    id: WORKSPACE_ID,
    repoId: 123,
    repoFullName: 'davood/demo',
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    baseTreeSha: 'b'.repeat(40),
    path: 'src/app.js',
    blobSha: 'c'.repeat(40),
    originalText: 'before\n',
    originalDigest: '0'.repeat(64),
    draftText: 'before\n',
    draftDigest: '0'.repeat(64),
    commitMessage: '',
    commitMessageDigest: '',
    currentIntentId: null,
    state: 'DRAFT'
  };

  return {
    calls,
    workspace,
    intents,
    async getWorkspace({ ownerId, workspaceId }) {
      calls.push(['getWorkspace', ownerId, workspaceId]);
      return ownerId === OWNER && workspaceId === WORKSPACE_ID
        ? structuredClone(workspace)
        : null;
    },
    async setPendingInput({ ownerId, workspaceId, mode }) {
      calls.push(['setPendingInput', ownerId, workspaceId, mode]);
      pending = { workspaceId, mode };
      return structuredClone(pending);
    },
    async getPendingInput({ ownerId }) {
      calls.push(['getPendingInput', ownerId]);
      return ownerId === OWNER && pending ? structuredClone(pending) : null;
    },
    async consumePendingInput({ ownerId, workspaceId, mode }) {
      calls.push(['consumePendingInput', ownerId, workspaceId, mode]);
      if (
        ownerId !== OWNER ||
        !pending ||
        pending.workspaceId !== workspaceId ||
        pending.mode !== mode
      )
        return false;
      pending = null;
      return true;
    },
    async updateDraft({ ownerId, workspaceId, text, digest }) {
      calls.push(['updateDraft', ownerId, workspaceId, text, digest]);
      workspace.draftText = text;
      workspace.draftDigest = digest;
      workspace.currentIntentId = null;
      workspace.state = 'DRAFT';
      return structuredClone(workspace);
    },
    async setCommitMessage({ ownerId, workspaceId, message, digest }) {
      calls.push(['setCommitMessage', ownerId, workspaceId, message, digest]);
      workspace.commitMessage = message;
      workspace.commitMessageDigest = digest;
      workspace.currentIntentId = null;
      workspace.state = 'DRAFT';
      return structuredClone(workspace);
    },
    async sealIntent({ ownerId, workspaceId, intent }) {
      calls.push(['sealIntent', ownerId, workspaceId, structuredClone(intent)]);
      if (workspace.currentIntentId) {
        const existing = intents.get(workspace.currentIntentId);
        if (existing?.intentDigest === intent.intentDigest)
          return structuredClone(existing);
      }
      intentCounter += 1;
      const id = `I${String(intentCounter).padStart(7, '0')}`;
      const sealed = {
        ...structuredClone(intent),
        id,
        workspaceId,
        state: 'READY'
      };
      intents.set(id, sealed);
      workspace.currentIntentId = id;
      workspace.state = 'READY';
      return structuredClone(sealed);
    }
  };
}

function makePlugin() {
  const github = makeGitHub();
  const workspaces = makeWorkspaces();
  const plugin = createGitHubPlugin({ github, menu: makeMenu(), workspaces });
  return { github, workspaces, plugin };
}

test('PluginRouter dispatchMessage applies the same policy boundary without auditing source text', async () => {
  const auditEvents = [];
  const plugin = {
    manifest: {
      id: 'demo',
      name: 'Demo',
      version: 1,
      commands: [],
      actions: { 'demo.message': { risk: 'READ' } }
    },
    resolveMessage(payload) {
      if (!payload?.pending) return null;
      return {
        actionId: 'demo.message',
        execute: async () => ({ text: 'accepted' })
      };
    }
  };
  const router = new PluginRouter({
    registry: new PluginRegistry([plugin]),
    policy: new ActionPolicy(),
    audit: new AuditLogger({ sink: (event) => auditEvents.push(event) })
  });
  const result = await router.dispatchMessage(
    { pending: { mode: 'draft' }, text: 'TOP SECRET SOURCE' },
    { isOwner: true, ownerId: OWNER }
  );
  assert.equal(result.text, 'accepted');
  assert.equal(
    JSON.stringify(auditEvents).includes('TOP SECRET SOURCE'),
    false
  );
});

test('legacy draft input is prepared without GitHub calls and the next owner text is consumed exactly once', async () => {
  const { github, workspaces, plugin } = makePlugin();
  const prepare = plugin.resolveCallback(`wtext:${WORKSPACE_ID}`, {
    ownerId: OWNER
  });
  assert.equal(prepare.actionId, 'github.workspace.input.prepare');
  assert.deepEqual(github.calls, []);
  const prompt = await prepare.execute();
  assert.match(prompt.text, /20,000|20000/);
  assert.deepEqual(github.calls, []);

  const pending = await workspaces.getPendingInput({ ownerId: OWNER });
  assert.deepEqual(pending, { workspaceId: WORKSPACE_ID, mode: 'draft' });
  const route = plugin.resolveMessage(
    { pending, text: 'after <tag>\n' },
    { ownerId: OWNER }
  );
  assert.equal(route.actionId, 'github.workspace.input.apply');
  const view = await route.execute();
  assert.match(view.text, /ذخیره|Draft|پیش.?نویس/i);
  assert.equal(workspaces.workspace.draftText, 'after <tag>\n');
  assert.equal(await workspaces.getPendingInput({ ownerId: OWNER }), null);

  const late = plugin.resolveMessage(
    {
      pending: await workspaces.getPendingInput({ ownerId: OWNER }),
      text: 'late mutation'
    },
    { ownerId: OWNER }
  );
  assert.equal(late, null);
  assert.equal(workspaces.workspace.draftText, 'after <tag>\n');
  assert.deepEqual(github.calls, []);
});

test('oversized multibyte legacy draft input is visibly rejected without mutating the old draft', async () => {
  const { workspaces, plugin } = makePlugin();
  await plugin
    .resolveCallback(`wtext:${WORKSPACE_ID}`, { ownerId: OWNER })
    .execute();
  const before = workspaces.workspace.draftText;
  const pending = await workspaces.getPendingInput({ ownerId: OWNER });
  const route = plugin.resolveMessage(
    { pending, text: '😀'.repeat(16385) },
    { ownerId: OWNER }
  );
  const view = await route.execute();
  assert.match(view.text, /65,536|65536|20,000|20000|مجاز|حد/i);
  assert.equal(workspaces.workspace.draftText, before);
  assert.equal(await workspaces.getPendingInput({ ownerId: OWNER }), null);
});

test('commit message input normalizes text and diff renders escaped bounded exact counts without GitHub mutation', async () => {
  const { github, workspaces, plugin } = makePlugin();
  await plugin
    .resolveCallback(`wmsg:${WORKSPACE_ID}`, { ownerId: OWNER })
    .execute();
  const pending = await workspaces.getPendingInput({ ownerId: OWNER });
  await plugin
    .resolveMessage(
      { pending, text: '  chore:   update workspace  ' },
      { ownerId: OWNER }
    )
    .execute();
  assert.equal(workspaces.workspace.commitMessage, 'chore: update workspace');

  workspaces.workspace.draftText = 'after <script>\n';
  workspaces.workspace.draftDigest = await digestText(
    workspaces.workspace.draftText
  );
  const diffRoute = plugin.resolveCallback(`wdiff:${WORKSPACE_ID}`, {
    ownerId: OWNER
  });
  assert.equal(diffRoute.actionId, 'github.workspace.diff');
  const diffView = await diffRoute.execute();
  assert.match(diffView.text, /\+1/);
  assert.match(diffView.text, /-1/);
  assert.doesNotMatch(diffView.text, /<script>/);
  assert.match(diffView.text, /&lt;script&gt;/);
  assert.deepEqual(github.calls, []);
});

test('READY rejects no-change, reuses identical material and mints a new intent after material change', async () => {
  const { github, workspaces, plugin } = makePlugin();
  workspaces.workspace.commitMessage = 'edit app';
  workspaces.workspace.commitMessageDigest = await digestText('edit app');

  const noChange = plugin.resolveCallback(`wready:${WORKSPACE_ID}`, {
    ownerId: OWNER
  });
  await assert.rejects(() => noChange.execute(), /change|تغییر|بدون/i);

  workspaces.workspace.draftText = 'after\n';
  workspaces.workspace.draftDigest = await digestText('after\n');
  const ready1 = await plugin
    .resolveCallback(`wready:${WORKSPACE_ID}`, { ownerId: OWNER })
    .execute();
  const commit1 = flatten(ready1).find((button) =>
    button.callback_data?.startsWith('wscommit:')
  )?.callback_data;
  assert.match(commit1, /^wscommit:123:[A-Za-z0-9_-]{8}$/);
  assert.ok(new TextEncoder().encode(commit1).byteLength <= 64);

  const ready2 = await plugin
    .resolveCallback(`wready:${WORKSPACE_ID}`, { ownerId: OWNER })
    .execute();
  const commit2 = flatten(ready2).find((button) =>
    button.callback_data?.startsWith('wscommit:')
  )?.callback_data;
  assert.equal(commit2, commit1);

  workspaces.workspace.draftText = 'after again\n';
  workspaces.workspace.draftDigest = await digestText('after again\n');
  workspaces.workspace.currentIntentId = null;
  workspaces.workspace.state = 'DRAFT';
  const ready3 = await plugin
    .resolveCallback(`wready:${WORKSPACE_ID}`, { ownerId: OWNER })
    .execute();
  const commit3 = flatten(ready3).find((button) =>
    button.callback_data?.startsWith('wscommit:')
  )?.callback_data;
  assert.notEqual(commit3, commit1);
  assert.deepEqual(github.calls, []);
});

test('bot preserves command precedence and routes raw pending workspace text exactly once', async () => {
  const bot = new NexaDevBot({});
  const calls = [];
  bot.telegram = {
    async sendMessage(chatId, text, replyMarkup) {
      calls.push(['sendMessage', chatId, text, replyMarkup]);
      return { ok: true };
    }
  };
  bot.workspaceStore = {
    isConfigured: () => true,
    async getPendingInput({ ownerId }) {
      calls.push(['getPendingInput', ownerId]);
      return { workspaceId: WORKSPACE_ID, mode: 'draft' };
    }
  };
  bot.router = {
    async dispatchMessage(payload, context) {
      calls.push([
        'dispatchMessage',
        structuredClone(payload),
        structuredClone(context)
      ]);
      return {
        text: 'workspace accepted',
        reply_markup: { inline_keyboard: [] }
      };
    }
  };

  await bot.handleMessage({
    chat: { id: 7 },
    from: { id: 42 },
    text: '/status'
  });
  assert.equal(
    calls.some((call) => call[0] === 'getPendingInput'),
    false
  );
  assert.equal(
    calls.some((call) => call[0] === 'dispatchMessage'),
    false
  );

  calls.length = 0;
  await bot.handleMessage({
    chat: { id: 7 },
    from: { id: 42 },
    text: '  exact draft text  \n'
  });
  const dispatch = calls.find((call) => call[0] === 'dispatchMessage');
  assert.equal(dispatch[1].text, '  exact draft text  \n');
  assert.deepEqual(dispatch[2], { isOwner: true, ownerId: OWNER });
});
