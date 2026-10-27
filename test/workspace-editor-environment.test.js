import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../src/config.js';
import { NexaDevBot } from '../src/bot-legacy.js';
import worker from '../src/index.js';
import { KillSwitchGuidedNexaDevBot } from '../src/kill-switch-bot.js';
import { makeReplayNamespace } from './helpers/replay-namespace.js';

const workspace = {
  id: 'W000000001',
  repoId: 1,
  path: 'README.md',
  state: 'DRAFT',
  originalText: 'one',
  draftText: 'two',
  baseHeadSha: 'a'.repeat(40)
};
async function editorLinks(configured) {
  const bot = new NexaDevBot({
    WORKSPACE_EDITOR_URL: configured,
    WORKSPACE_STORE: { idFromName: (name) => name, get: () => ({}) }
  });
  bot.workspaceStore.getWorkspace = async () => workspace;
  bot.workspaceStore.createNavigationRefs = async () => [];
  const view = await bot.githubPlugin
    .resolveCallback('ws:W000000001', { ownerId: '42' })
    .execute();
  return view.reply_markup.inline_keyboard
    .flat()
    .filter((button) => button.web_app)
    .map((button) => button.web_app.url);
}

test('bot workspace editor links use the configured acceptance environment', async () => {
  const links = await editorLinks('https://acceptance.test/workspace/editor');
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.equal(new URL(link).origin, 'https://acceptance.test');
    assert.equal(new URL(link).pathname, '/workspace/editor');
    assert.equal(new URL(link).searchParams.get('workspaceId'), workspace.id);
  }
});

test('editor URL configuration rejects credentials, queries, fragments and unexpected routes', async () => {
  for (const value of [
    'http://acceptance.test/workspace/editor',
    'https://user:password@acceptance.test/workspace/editor',
    'https://acceptance.test/workspace/editor?token=private',
    'https://acceptance.test/workspace/editor#private',
    'https://acceptance.test/other',
    'not a url',
    ''
  ]) {
    assert.deepEqual(await editorLinks(value), [], value);
  }
});

test('the established editor URL remains the default for direct bot construction', async () => {
  const links = await editorLinks(undefined);
  assert.ok(links.length > 0);
  assert.equal(
    new URL(links[0]).origin,
    new URL(config.DEFAULT_CONFIG.workspaceEditorUrl).origin
  );
});

test('configuration view reports the validated environment URL without rejected credential text', () => {
  const configured = new KillSwitchGuidedNexaDevBot({
    WORKSPACE_EDITOR_URL: 'https://acceptance.test/workspace/editor'
  });
  assert.match(
    configured.menu.getEditorConfigView().text,
    /https:\/\/acceptance\.test\/workspace\/editor/
  );
  const invalid = new KillSwitchGuidedNexaDevBot({
    WORKSPACE_EDITOR_URL:
      'https://user:PRIVATE_URL_SENTINEL@acceptance.test/workspace/editor'
  });
  assert.doesNotMatch(
    invalid.menu.getEditorConfigView().text,
    /PRIVATE_URL_SENTINEL|nexa-dev-bot\.davoodmehraban89/
  );
  assert.match(invalid.menu.getEditorConfigView().text, /پیکربندی نشده/);
});

test('webhook editor default stays on its own Worker origin and respects explicit configuration', async () => {
  const original = KillSwitchGuidedNexaDevBot.prototype.handleUpdate;
  KillSwitchGuidedNexaDevBot.prototype.handleUpdate = async function () {
    return { ok: true, editorUrl: this.env.WORKSPACE_EDITOR_URL };
  };
  try {
    for (const configured of [
      undefined,
      'https://custom.test/workspace/editor',
      ''
    ]) {
      const response = await worker.fetch(
        new Request('https://acceptance.test/telegram/webhook', {
          method: 'POST',
          headers: { 'X-Telegram-Bot-Api-Secret-Token': 'webhook' },
          body: JSON.stringify({
            update_id: 1,
            message: { from: { id: 42 }, chat: { id: 42 }, text: '/help' }
          })
        }),
        {
          OWNER_TELEGRAM_ID: '42',
          TELEGRAM_BOT_TOKEN: '12345:test',
          TELEGRAM_WEBHOOK_SECRET: 'webhook',
          APPROVAL_REPLAY_GUARD: makeReplayNamespace(),
          ...(configured === undefined
            ? {}
            : { WORKSPACE_EDITOR_URL: configured })
        }
      );
      assert.equal(response.status, 200);
      assert.equal(
        (await response.json()).editorUrl,
        configured ?? 'https://acceptance.test/workspace/editor'
      );
    }
  } finally {
    KillSwitchGuidedNexaDevBot.prototype.handleUpdate = original;
  }
});
