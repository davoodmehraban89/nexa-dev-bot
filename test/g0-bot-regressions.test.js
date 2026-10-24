import test from 'node:test';
import assert from 'node:assert/strict';
import { GuidedNexaDevBot } from '../src/guide-bot.js';

const repository = {
  id: 1001,
  name: 'nexa-dev-bot',
  full_name: 'owner/nexa-dev-bot',
  default_branch: 'main',
  private: true
};
const targetSha = 'a'.repeat(40);
const versionId = '11111111-1111-4111-8111-111111111111';

function installProviders(t, { githubFailure = false } = {}) {
  const telegramCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const endpoint = new URL(url);
    if (endpoint.hostname === 'api.telegram.org') {
      const body = JSON.parse(options.body);
      telegramCalls.push({ method: endpoint.pathname.split('/').at(-1), body });
      return Response.json({ ok: true, result: { message_id: 700 } });
    }
    assert.equal(
      options.method || 'GET',
      'GET',
      'diagnostics must remain read-only'
    );
    if (endpoint.hostname === 'api.github.com') {
      if (endpoint.pathname === '/user/repos') {
        return githubFailure
          ? Response.json({ message: 'Permission denied' }, { status: 403 })
          : Response.json([repository]);
      }
      if (endpoint.pathname === '/repositories/1001')
        return Response.json(repository);
      if (endpoint.pathname === '/repos/owner/nexa-dev-bot/commits') {
        return Response.json([
          { sha: targetSha, commit: { message: 'docs: verify delivery' } }
        ]);
      }
      if (endpoint.pathname === '/repos/owner/nexa-dev-bot/actions/runs') {
        return Response.json({ workflow_runs: [] });
      }
    }
    if (endpoint.hostname === 'api.cloudflare.com') {
      const resource = endpoint.pathname.split('/').at(-1);
      const result = {
        deployments: {
          deployments: [
            {
              id: 'deployment-1',
              versions: [{ version_id: versionId, percentage: 100 }]
            }
          ]
        },
        versions: { items: [{ id: versionId }] },
        settings: { bindings: [], observability: {} }
      }[resource];
      if (result) return Response.json({ success: true, result });
    }
    throw new Error(
      `Unexpected provider request: ${endpoint.hostname}${endpoint.pathname}`
    );
  });
  return telegramCalls;
}

function createBot() {
  return new GuidedNexaDevBot({
    TELEGRAM_BOT_TOKEN: 'telegram-test-token',
    TELEGRAM_WEBHOOK_SECRET: 'webhook-test-secret',
    OWNER_TELEGRAM_ID: '123',
    GITHUB_TOKEN: 'github-test-token',
    GITHUB_OWNER: 'owner',
    CLOUDFLARE_API_TOKEN: 'cloudflare-test-token',
    CLOUDFLARE_ACCOUNT_ID: 'account-1',
    CLOUDFLARE_WORKER_NAME: 'nexa-dev-bot'
  });
}

for (const text of ['/status', '📊 وضعیت']) {
  for (const githubFailure of [false, true]) {
    test(`${text} sends the resolved live status when GitHub ${githubFailure ? 'fails' : 'succeeds'}`, async (t) => {
      const calls = installProviders(t, { githubFailure });
      const result = await createBot().handleMessage({
        chat: { id: 123 },
        from: { id: 123 },
        text
      });

      assert.equal(result.ok, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'sendMessage');
      assert.equal(
        typeof calls[0].body.text,
        'string',
        'status must resolve before sending'
      );
      assert.match(calls[0].body.text, /GitHub live READ/);
      assert.match(
        calls[0].body.text,
        githubFailure ? /❌ ناموفق.*403/ : /✅ متصل؛ 1 Repository/
      );
      assert.ok(
        calls[0].body.reply_markup.inline_keyboard
          .flat()
          .some((button) => button.callback_data === 'menu:status')
      );
    });
  }
}

test('Cloudflare delivery callback sends balanced Telegram HTML with provider evidence', async (t) => {
  const calls = installProviders(t);
  const result = await createBot().handleCallbackQuery({
    id: 'delivery-audit',
    from: { id: 123 },
    data: 'cf:delivery',
    message: { chat: { id: 123 }, message_id: 700 }
  });

  assert.equal(result.ok, true);
  const edited = calls.find((call) => call.method === 'editMessageText');
  assert.equal(edited.body.message_id, 700);
  assert.equal(edited.body.parse_mode, 'HTML');
  assert.match(edited.body.text, /CI\/CD Control Plane/);
  assert.match(edited.body.text, /State: <b>UNKNOWN<\/b>/);
  assert.match(edited.body.text, /aaaaaaaaaaaa/);
  assert.match(edited.body.text, /Delivery evidence is incomplete/);
  assert.match(edited.body.text, new RegExp(versionId));
  const tags = [];
  for (const [, closing, tag] of edited.body.text.matchAll(
    /<(\/?)(b|code)>/g
  )) {
    if (closing) assert.equal(tags.pop(), tag, `unmatched closing ${tag} tag`);
    else tags.push(tag);
  }
  assert.deepEqual(tags, [], 'Telegram HTML must close every opened tag');
});
