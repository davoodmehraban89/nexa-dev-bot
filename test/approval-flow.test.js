import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function makeReplayNamespace() {
  const used = new Set();
  return {
    idFromName(name) {
      return String(name);
    },
    get(id) {
      return {
        async fetch(request) {
          const body = await request.json();
          const expiresAt = Number(body?.expiresAt);
          if (!Number.isFinite(expiresAt)) {
            return Response.json(
              { accepted: false, reason: 'invalid_expiry' },
              { status: 400 }
            );
          }
          if (expiresAt < Date.now()) {
            return Response.json(
              { accepted: false, reason: 'expired' },
              { status: 410 }
            );
          }
          const key = String(id);
          if (used.has(key)) {
            return Response.json(
              { accepted: false, reason: 'already_used' },
              { status: 409 }
            );
          }
          used.add(key);
          return Response.json({ accepted: true });
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
        full_name: 'davoodmehraban89/demo',
        private: true,
        default_branch: 'main',
        archived: false,
        html_url: 'https://github.com/davoodmehraban89/demo'
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

async function sendUpdate(update, runtime = env) {
  const response = await worker.fetch(webhook(update), runtime);
  assert.equal(response.status, 200);
  return response.json();
}

test('WRITE callback renders owner-bound approval and performs no GitHub write before approval', async () => {
  const mock = installMock();
  try {
    const menuMessage = { message_id: 700, chat: { id: 123 } };
    const result = await sendUpdate({
      callback_query: {
        id: 'rerun-request',
        from: { id: 123 },
        data: 'rerun:1001:55',
        message: menuMessage
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.approvalRequired, true);
    assert.equal(
      mock.githubCalls.length,
      0,
      'GitHub write must not execute before approval'
    );

    const edit = mock.telegramCalls.find(
      (call) => call.method === 'editMessageText'
    );
    assert.ok(edit, 'approval request must edit the existing Telegram message');
    assert.match(edit.body.text, /تأیید|اجرا/);

    const approveButton = edit.body.reply_markup.inline_keyboard
      .flat()
      .find((button) =>
        String(button.callback_data || '').startsWith('approve:')
      );
    assert.ok(approveButton, 'approval button must be present');
    assert.ok(
      new TextEncoder().encode(approveButton.callback_data).length <= 64
    );
  } finally {
    mock.restore();
  }
});

test('approve callback executes exactly once and replay is rejected', async () => {
  const mock = installMock();
  try {
    const menuMessage = { message_id: 701, chat: { id: 123 } };

    await sendUpdate({
      callback_query: {
        id: 'rerun-request',
        from: { id: 123 },
        data: 'rerun:1001:55',
        message: menuMessage
      }
    });

    const approvalEdit = mock.telegramCalls
      .filter((call) => call.method === 'editMessageText')
      .at(-1);
    const approveButton = approvalEdit.body.reply_markup.inline_keyboard
      .flat()
      .find((button) =>
        String(button.callback_data || '').startsWith('approve:')
      );
    assert.ok(approveButton);

    const first = await sendUpdate({
      callback_query: {
        id: 'approve-once',
        from: { id: 123 },
        data: approveButton.callback_data,
        message: menuMessage
      }
    });
    assert.equal(first.ok, true);

    const writesAfterFirst = mock.githubCalls.filter(
      (call) => call.method === 'POST'
    );
    assert.equal(writesAfterFirst.length, 1);
    assert.match(writesAfterFirst[0].url, /rerun-failed-jobs$/);

    const replay = await sendUpdate({
      callback_query: {
        id: 'approve-replay',
        from: { id: 123 },
        data: approveButton.callback_data,
        message: menuMessage
      }
    });
    assert.equal(replay.ok, false);
    assert.match(String(replay.error || ''), /used|replay|approval/i);

    const writesAfterReplay = mock.githubCalls.filter(
      (call) => call.method === 'POST'
    );
    assert.equal(
      writesAfterReplay.length,
      1,
      'replay must not perform a second GitHub write'
    );
  } finally {
    mock.restore();
  }
});

test('WRITE approval falls back to the configured Telegram webhook secret when no dedicated signing secret exists', async () => {
  const mock = installMock();
  try {
    const result = await sendUpdate(
      {
        callback_query: {
          id: 'fallback-signing-secret',
          from: { id: 123 },
          data: 'rerun:1001:55',
          message: { message_id: 702, chat: { id: 123 } }
        }
      },
      {
        ...env,
        APPROVAL_SIGNING_SECRET: ''
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.approvalRequired, true);
    assert.equal(mock.githubCalls.length, 0);
    const edit = mock.telegramCalls
      .filter((call) => call.method === 'editMessageText')
      .at(-1);
    assert.ok(
      edit.body.reply_markup.inline_keyboard
        .flat()
        .some((button) =>
          String(button.callback_data || '').startsWith('approve:')
        )
    );
  } finally {
    mock.restore();
  }
});

test('approval lifecycle is audited without logging signed callback tokens', async () => {
  const mock = installMock();
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.map(String).join(' '));

  try {
    const menuMessage = { message_id: 703, chat: { id: 123 } };
    await sendUpdate({
      callback_query: {
        id: 'audit-issue',
        from: { id: 123 },
        data: 'rerun:1001:55',
        message: menuMessage
      }
    });

    const approvalEdit = mock.telegramCalls
      .filter((call) => call.method === 'editMessageText')
      .at(-1);
    const approveButton = approvalEdit.body.reply_markup.inline_keyboard
      .flat()
      .find((button) =>
        String(button.callback_data || '').startsWith('approve:')
      );
    assert.ok(approveButton);

    await sendUpdate({
      callback_query: {
        id: 'audit-verify',
        from: { id: 123 },
        data: approveButton.callback_data,
        message: menuMessage
      }
    });

    await sendUpdate({
      callback_query: {
        id: 'audit-reject',
        from: { id: 123 },
        data: approveButton.callback_data,
        message: menuMessage
      }
    });

    const auditText = logs
      .filter((line) => line.startsWith('nexa_audit '))
      .join('\n');
    assert.match(auditText, /"event":"approval_issued"/);
    assert.match(auditText, /"event":"approval_verified"/);
    assert.match(auditText, /"event":"approval_rejected"/);
    assert.doesNotMatch(
      auditText,
      new RegExp(
        approveButton.callback_data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
    );
  } finally {
    console.log = originalLog;
    mock.restore();
  }
});
