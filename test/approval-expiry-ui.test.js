import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  makeReplayNamespace,
  withUpdateId
} from './helpers/replay-namespace.js';

const env = {
  TELEGRAM_WEBHOOK_SECRET: 'right',
  OWNER_TELEGRAM_ID: '123',
  TELEGRAM_BOT_TOKEN: 'telegram-test-token',
  GITHUB_TOKEN: 'github-test-token',
  GITHUB_OWNER: 'davoodmehraban89',
  APPROVAL_SIGNING_SECRET: 'approval-test-secret',
  APPROVAL_REPLAY_GUARD: makeReplayNamespace()
};

function webhook(update) {
  return new Request('https://example.test/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'right'
    },
    body: JSON.stringify(withUpdateId(update))
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function installMock() {
  const telegramCalls = [];
  const githubCalls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.startsWith('https://api.telegram.org/')) {
      const method = value.split('/').at(-1);
      const body = options.body ? JSON.parse(options.body) : {};
      telegramCalls.push({ method, body });
      return json({
        ok: true,
        result: { message_id: body.message_id || 700, ...body }
      });
    }
    if (value === 'https://api.github.com/repositories/1001') {
      githubCalls.push({ url: value, method: options.method || 'GET' });
      return json({
        id: 1001,
        name: 'demo',
        full_name: 'davoodmehraban89/demo'
      });
    }
    if (
      value ===
      'https://api.github.com/repos/davoodmehraban89/demo/actions/runs/55/rerun-failed-jobs'
    ) {
      githubCalls.push({ url: value, method: options.method || 'GET' });
      return new Response('', { status: 201 });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };

  return {
    telegramCalls,
    githubCalls,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

async function sendUpdate(update) {
  const response = await worker.fetch(webhook(update), env);
  assert.equal(response.status, 200);
  return response.json();
}

test('expired approval gives visible Telegram feedback and no GitHub write', async () => {
  const mock = installMock();
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;

  try {
    const menuMessage = { message_id: 900, chat: { id: 123 } };
    const issued = await sendUpdate({
      callback_query: {
        id: 'issue-expiring-approval',
        from: { id: 123 },
        data: 'rerun:1001:55',
        message: menuMessage
      }
    });
    assert.equal(issued.approvalRequired, true);

    const approvalEdit = mock.telegramCalls
      .filter((call) => call.method === 'editMessageText')
      .at(-1);
    const approveButton = approvalEdit.body.reply_markup.inline_keyboard
      .flat()
      .find((button) =>
        String(button.callback_data || '').startsWith('approve:')
      );
    assert.ok(approveButton);

    const editCountBeforeExpiryClick = mock.telegramCalls.filter(
      (call) => call.method === 'editMessageText'
    ).length;

    now += 121_000;
    const expired = await sendUpdate({
      callback_query: {
        id: 'expired-approval-click',
        from: { id: 123 },
        data: approveButton.callback_data,
        message: {
          ...menuMessage,
          text: approvalEdit.body.text,
          reply_markup: approvalEdit.body.reply_markup
        }
      }
    });

    assert.equal(expired.ok, false);
    assert.equal(
      mock.githubCalls.filter((call) => call.method === 'POST').length,
      0
    );

    const edits = mock.telegramCalls.filter(
      (call) => call.method === 'editMessageText'
    );
    assert.equal(
      edits.length,
      editCountBeforeExpiryClick + 1,
      'expired approval must visibly update the Telegram message'
    );
    const feedback = edits.at(-1);
    assert.match(feedback.body.text, /منقضی|اعتبار|اجرا نشد/);
    assert.ok(
      feedback.body.reply_markup.inline_keyboard
        .flat()
        .some((button) => button.callback_data === 'run:1001:55'),
      'feedback must provide a safe route back to the workflow run'
    );
  } finally {
    Date.now = originalNow;
    mock.restore();
  }
});
