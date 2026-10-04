import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEditableFile } from '../src/core/workspace-policy.js';
import { createWorkspaceController } from '../src/plugins/github/workspace.js';

const encoder = new TextEncoder();

async function loadWebAppAuth() {
  try {
    return await import('../src/core/telegram-webapp-auth.js');
  } catch {
    return {};
  }
}

async function loadWorkspaceEditor() {
  try {
    return await import('../src/workspace-editor.js');
  } catch {
    return {};
  }
}

async function hmacSha256(keyBytes, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

async function signedInitData({ botToken, userId, authDate }) {
  const fields = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAE-test-query',
    user: JSON.stringify({ id: userId, first_name: 'Owner' })
  });
  const dataCheckString = [...fields.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await hmacSha256(encoder.encode('WebAppData'), botToken);
  const signature = await hmacSha256(secretKey, dataCheckString);
  fields.set('hash', hex(signature));
  return fields.toString();
}

test('README-sized Markdown is editable while the expanded editor ceiling remains bounded', () => {
  const readme = `# Nexa Dev Bot\n\n${'x'.repeat(8200)}`;
  const accepted = validateEditableFile({ path: 'README.md', text: readme });
  assert.equal(accepted.editable, true, accepted.reason);

  const tooManyChars = validateEditableFile({ path: 'README.md', text: 'x'.repeat(20001) });
  assert.equal(tooManyChars.editable, false);
  assert.match(tooManyChars.reason, /20,000|20000/);

  const tooManyBytes = validateEditableFile({ path: 'README.md', text: 'ok', byteLength: 65537 });
  assert.equal(tooManyBytes.editable, false);
  assert.match(tooManyBytes.reason, /65,536|65536/);
});

test('Workspace view exposes a real Telegram Web App editor instead of primary ForceReply paste', async () => {
  const workspaces = {
    async getWorkspace() {
      return {
        id: 'W000000001',
        repoId: 123,
        path: 'README.md',
        state: 'DRAFT',
        baseHeadSha: 'a'.repeat(40),
        originalText: '# before\n',
        draftText: '# before\n',
        commitMessage: ''
      };
    }
  };
  const controller = createWorkspaceController({
    github: {},
    workspaces,
    editorUrl: 'https://example.com/workspace/editor'
  });
  const view = await controller.resolveCallback('ws:W000000001', { ownerId: '42' }).execute();
  const buttons = view.reply_markup.inline_keyboard.flat();
  const editor = buttons.find(button => button.web_app?.url);
  assert.ok(editor, 'Workspace must include a web_app editor button');
  assert.equal(editor.web_app.url, 'https://example.com/workspace/editor?workspaceId=W000000001');
  assert.doesNotMatch(editor.text, /Paste/i);
  assert.equal(buttons.some(button => button.callback_data === 'wtext:W000000001'), false);
});

test('Telegram Mini App initData validation is owner-bound, tamper-resistant and freshness-bounded', async () => {
  const auth = await loadWebAppAuth();
  assert.equal(typeof auth.validateTelegramWebAppInitData, 'function', 'Mini App auth helper must exist');
  const botToken = '123456:TEST_ONLY_TOKEN';
  const nowSeconds = 1_800_000_000;
  const initData = await signedInitData({ botToken, userId: 42, authDate: nowSeconds - 30 });

  const valid = await auth.validateTelegramWebAppInitData(initData, {
    botToken,
    ownerId: '42',
    now: () => nowSeconds * 1000,
    maxAgeSeconds: 3600
  });
  assert.equal(valid.userId, '42');
  assert.equal(valid.authDate, nowSeconds - 30);

  await assert.rejects(
    () => auth.validateTelegramWebAppInitData(initData.replace('Owner', 'Intruder'), {
      botToken,
      ownerId: '42',
      now: () => nowSeconds * 1000,
      maxAgeSeconds: 3600
    }),
    /signature|hash|invalid/i
  );

  await assert.rejects(
    () => auth.validateTelegramWebAppInitData(initData, {
      botToken,
      ownerId: '99',
      now: () => nowSeconds * 1000,
      maxAgeSeconds: 3600
    }),
    /owner|forbidden/i
  );

  const stale = await signedInitData({ botToken, userId: 42, authDate: nowSeconds - 7200 });
  await assert.rejects(
    () => auth.validateTelegramWebAppInitData(stale, {
      botToken,
      ownerId: '42',
      now: () => nowSeconds * 1000,
      maxAgeSeconds: 3600
    }),
    /expired|stale|auth_date/i
  );
});

test('Workspace editor HTTP handler loads and saves only the durable draft and never performs a provider write', async () => {
  const editorModule = await loadWorkspaceEditor();
  assert.equal(typeof editorModule.handleWorkspaceEditorRequest, 'function', 'Workspace editor HTTP handler must exist');
  assert.equal(typeof editorModule.renderWorkspaceEditorPage, 'function', 'Workspace editor page renderer must exist');

  const botToken = '123456:TEST_ONLY_TOKEN';
  const nowSeconds = 1_800_000_000;
  const initData = await signedInitData({ botToken, userId: 42, authDate: nowSeconds - 10 });
  const calls = [];
  const workspaces = {
    async getWorkspace({ ownerId, workspaceId }) {
      calls.push(['getWorkspace', ownerId, workspaceId]);
      return {
        id: workspaceId,
        path: 'README.md',
        state: 'DRAFT',
        originalText: '# old\n',
        draftText: '# old\n'
      };
    },
    async updateDraft({ ownerId, workspaceId, text, digest }) {
      calls.push(['updateDraft', ownerId, workspaceId, text, digest]);
      return { id: workspaceId, path: 'README.md', state: 'DRAFT', draftText: text };
    }
  };
  const context = {
    workspaces,
    botToken,
    ownerId: '42',
    now: () => nowSeconds * 1000
  };
  const headers = { 'x-telegram-init-data': initData };

  const getResponse = await editorModule.handleWorkspaceEditorRequest(
    new Request('https://example.com/workspace/api/editor?workspaceId=W000000001', { headers }),
    context
  );
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get('cache-control'), 'no-store');
  const loaded = await getResponse.json();
  assert.equal(loaded.workspace.path, 'README.md');
  assert.equal(loaded.workspace.draftText, '# old\n');

  const putResponse = await editorModule.handleWorkspaceEditorRequest(
    new Request('https://example.com/workspace/api/editor', {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'W000000001', text: '# new\n' })
    }),
    context
  );
  assert.equal(putResponse.status, 200);
  assert.equal(calls.filter(call => call[0] === 'updateDraft').length, 1);
  assert.equal(calls.find(call => call[0] === 'updateDraft')[3], '# new\n');

  const html = editorModule.renderWorkspaceEditorPage();
  assert.match(html, /<textarea/i);
  assert.match(html, /Telegram\.WebApp/i);
  assert.match(html, /ذخیره|Save/i);
});
