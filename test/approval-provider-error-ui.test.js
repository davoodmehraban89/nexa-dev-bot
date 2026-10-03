import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function makeReplayNamespace() {
  const used = new Set();
  return {
    idFromName(name) { return String(name); },
    get(id) {
      return {
        async fetch(request) {
          const body = await request.json();
          const key = String(id);
          if (used.has(key)) return Response.json({ accepted: false, reason: 'already_used' }, { status: 409 });
          used.add(key);
          return Response.json({ accepted: true, expiresAt: body.expiresAt });
        }
      };
    }
  };
}

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
    body: JSON.stringify(update)
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
      return json({ ok: true, result: { message_id: body.message_id || 950, ...body } });
    }
    if (value === 'https://api.github.com/repositories/1001') {
      githubCalls.push({ url: value, method: options.method || 'GET' });
      return json({ id: 1001, name: 'demo', full_name: 'davoodmehraban89/demo' });
    }
    if (value === 'https://api.github.com/repos/davoodmehraban89/demo/actions/runs/55/rerun-failed-jobs') {
      githubCalls.push({ url: value, method: options.method || 'GET' });
      return json({ message: 'Resource not accessible by personal access token' }, 403);
    }
    throw new Error(`Unexpected URL: ${value}`);
  };

  return { telegramCalls, githubCalls, restore() { globalThis.fetch = originalFetch; } };
}

async function sendUpdate(update) {
  const response = await worker.fetch(webhook(update), env);
  assert.equal(response.status, 200);
  return response.json();
}

test('approved GitHub WRITE provider failure visibly updates Telegram and does not claim success', async () => {
  const mock = installMock();
  try {
    const menuMessage = { message_id: 950, chat: { id: 123 } };
    const issued = await sendUpdate({
      callback_query: {
        id: 'issue-provider-failure-approval',
        from: { id: 123 },
        data: 'rerun:1001:55',
        message: menuMessage
      }
    });
    assert.equal(issued.approvalRequired, true);

    const approvalEdit = mock.telegramCalls.filter(call => call.method === 'editMessageText').at(-1);
    const approveButton = approvalEdit.body.reply_markup.inline_keyboard
      .flat()
      .find(button => String(button.callback_data || '').startsWith('approve:'));
    assert.ok(approveButton);

    const result = await sendUpdate({
      callback_query: {
        id: 'approve-provider-failure',
        from: { id: 123 },
        data: approveButton.callback_data,
        message: {
          ...menuMessage,
          text: approvalEdit.body.text,
          reply_markup: approvalEdit.body.reply_markup
        }
      }
    });

    assert.equal(result.ok, false);
    const posts = mock.githubCalls.filter(call => call.method === 'POST');
    assert.equal(posts.length, 1, 'approved provider write should be attempted exactly once');

    const edits = mock.telegramCalls.filter(call => call.method === 'editMessageText');
    assert.equal(edits.length, 2, 'provider failure must visibly replace the approval message');
    const feedback = edits.at(-1);
    assert.match(feedback.body.text, /اجرا نشد|GitHub|403|دسترسی/);
    assert.doesNotMatch(feedback.body.text, /موفق|success/i);
    assert.ok(
      feedback.body.reply_markup.inline_keyboard.flat().some(button => button.callback_data === 'run:1001:55'),
      'provider failure must provide a safe route back to the run'
    );
  } finally {
    mock.restore();
  }
});