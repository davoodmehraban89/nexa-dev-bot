import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  makeReplayNamespace,
  withUpdateId
} from './helpers/replay-namespace.js';

const env = {
  APPROVAL_REPLAY_GUARD: makeReplayNamespace(),
  TELEGRAM_WEBHOOK_SECRET: 'right',
  OWNER_TELEGRAM_ID: '123',
  TELEGRAM_BOT_TOKEN: 'telegram-test-token',
  GITHUB_TOKEN: 'github-test-token',
  GITHUB_OWNER: 'davoodmehraban89'
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
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });

function installApiMock() {
  const telegramCalls = [];
  const githubCalls = [];
  const originalFetch = globalThis.fetch;
  const folderSha = 'a'.repeat(40);
  const fileSha = 'b'.repeat(40);
  const nestedFileSha = 'c'.repeat(40);

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
    if (!value.startsWith('https://api.github.com/'))
      throw new Error(`Unexpected URL: ${value}`);
    githubCalls.push(value);

    if (value.startsWith('https://api.github.com/user/repos?'))
      return json([
        {
          id: 1001,
          name: 'demo',
          full_name: 'davoodmehraban89/demo',
          private: true,
          default_branch: 'main',
          stargazers_count: 0,
          forks_count: 0,
          description: 'Demo repository'
        }
      ]);
    if (
      value === 'https://api.github.com/repositories/1001' ||
      value === 'https://api.github.com/repos/davoodmehraban89/demo'
    )
      return json({
        id: 1001,
        name: 'demo',
        full_name: 'davoodmehraban89/demo',
        private: true,
        default_branch: 'main',
        archived: false,
        description: 'Demo repository',
        html_url: 'https://github.com/davoodmehraban89/demo'
      });
    if (value === 'https://api.github.com/repos/davoodmehraban89/demo/contents')
      return json([
        { name: 'src', path: 'src', type: 'dir', size: 0, sha: folderSha },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: 100,
          sha: fileSha
        }
      ]);
    if (
      value ===
      `https://api.github.com/repos/davoodmehraban89/demo/git/trees/${folderSha}`
    )
      return json({
        tree: [{ path: 'index.js', type: 'blob', size: 42, sha: nestedFileSha }]
      });
    if (
      value ===
      `https://api.github.com/repos/davoodmehraban89/demo/git/blobs/${nestedFileSha}`
    )
      return json({
        encoding: 'base64',
        size: 21,
        content: btoa('console.log("hello")\n')
      });
    if (
      value ===
      'https://api.github.com/repos/davoodmehraban89/demo/commits?per_page=5'
    )
      return json([
        {
          sha: '1234567890abcdef',
          commit: {
            message: 'fix mobile menu',
            author: { name: 'Davood', date: '2026-10-02T10:00:00Z' }
          },
          author: { login: 'davoodmehraban89' }
        }
      ]);
    if (
      value ===
      'https://api.github.com/repos/davoodmehraban89/demo/pulls?state=all&per_page=10'
    )
      return json([
        {
          number: 7,
          title: 'Improve bot UI',
          state: 'open',
          merged_at: null,
          created_at: '2026-10-02T10:00:00Z',
          html_url: 'https://github.com/davoodmehraban89/demo/pull/7',
          user: { login: 'davoodmehraban89' }
        }
      ]);
    if (
      value ===
      'https://api.github.com/repos/davoodmehraban89/demo/actions/runs?per_page=3'
    )
      return json({
        workflow_runs: [
          {
            id: 1,
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            head_branch: 'main',
            head_sha: '1234567890abcdef1234567890abcdef12345678',
            run_number: 1,
            head_commit: { message: 'fix mobile menu' },
            html_url: 'https://github.com/davoodmehraban89/demo/actions/runs/1'
          }
        ]
      });
    if (
      value ===
      'https://api.github.com/repos/davoodmehraban89/demo/actions/runs?per_page=10'
    )
      return json({
        workflow_runs: [
          {
            id: 1,
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            head_branch: 'main',
            head_sha: '1234567890abcdef1234567890abcdef12345678',
            run_number: 1,
            event: 'push',
            head_commit: { message: 'fix mobile menu' },
            html_url: 'https://github.com/davoodmehraban89/demo/actions/runs/1'
          }
        ]
      });
    return json({ message: 'Not Found' }, 404);
  };

  return {
    telegramCalls,
    githubCalls,
    folderSha,
    nestedFileSha,
    restore: () => {
      globalThis.fetch = originalFetch;
    }
  };
}

async function sendUpdate(update) {
  const response = await worker.fetch(webhook(update), env);
  assert.equal(response.status, 200);
  return response.json();
}

test('persistent quick menu bootstrap keeps later inline navigation on one Telegram message', async () => {
  const mock = installApiMock();
  try {
    await sendUpdate({
      message: {
        message_id: 1,
        from: { id: 123 },
        chat: { id: 123 },
        text: '/start'
      }
    });
    const startSends = mock.telegramCalls.filter(
      (call) => call.method === 'sendMessage'
    );
    assert.equal(startSends.length, 2);
    assert.equal(startSends[0].body.reply_markup.is_persistent, true);
    assert.ok(startSends[0].body.reply_markup.keyboard);
    assert.match(startSends[1].body.text, /Nexa Dev Bot/);

    const message = { message_id: 700, chat: { id: 123 } };
    for (const data of ['menu:repos', 'repo:1001', 'menu:repos', 'menu:main']) {
      await sendUpdate({
        callback_query: { id: data, from: { id: 123 }, data, message }
      });
    }
    const edits = mock.telegramCalls.filter(
      (call) => call.method === 'editMessageText'
    );
    assert.equal(edits.length, 4);
    assert.ok(edits.every((call) => call.body.message_id === 700));
    assert.match(edits[0].body.text, /فهرست مخزن‌ها/);
    assert.match(edits[1].body.text, /پروژه: demo/);
    assert.match(edits[3].body.text, /Nexa Dev Bot/);
    assert.equal(
      mock.telegramCalls.filter((call) => call.method === 'sendMessage').length,
      2,
      'callbacks must not create extra chat messages'
    );
  } finally {
    mock.restore();
  }
});

test('repository activity views use live GitHub responses and edit in place', async () => {
  const mock = installApiMock();
  try {
    const message = { message_id: 701, chat: { id: 123 } };
    for (const data of [
      'files:1001',
      'commits:1001',
      'pr:1001',
      'status:1001'
    ]) {
      await sendUpdate({
        callback_query: { id: data, from: { id: 123 }, data, message }
      });
    }
    const edits = mock.telegramCalls.filter(
      (call) => call.method === 'editMessageText'
    );
    assert.equal(edits.length, 4);
    assert.match(edits[0].body.text, /README\.md/);
    assert.match(edits[1].body.text, /fix mobile menu/);
    assert.match(edits[2].body.text, /#7/);
    assert.match(edits[3].body.text, /CI/);
  } finally {
    mock.restore();
  }
});

test('/repos uses numeric repository ids in callbacks', async () => {
  const mock = installApiMock();
  try {
    await sendUpdate({
      message: {
        message_id: 1,
        from: { id: 123 },
        chat: { id: 123 },
        text: '/repos'
      }
    });
    const sent = mock.telegramCalls.find(
      (call) => call.method === 'sendMessage'
    );
    const buttons = sent.body.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((button) => button.callback_data === 'repo:1001'));
    assert.ok(
      mock.githubCalls.some((url) =>
        url.startsWith('https://api.github.com/user/repos?')
      )
    );
  } finally {
    mock.restore();
  }
});

test('deep file browser opens directory and file previews in the same Telegram message', async () => {
  const mock = installApiMock();
  try {
    const message = { message_id: 702, chat: { id: 123 } };
    await sendUpdate({
      callback_query: {
        id: 'root',
        from: { id: 123 },
        data: 'files:1001',
        message
      }
    });
    let edits = mock.telegramCalls.filter(
      (call) => call.method === 'editMessageText'
    );
    assert.ok(
      edits
        .at(-1)
        .body.reply_markup.inline_keyboard.flat()
        .some(
          (button) => button.callback_data === `tree:1001:${mock.folderSha}`
        )
    );

    await sendUpdate({
      callback_query: {
        id: 'tree',
        from: { id: 123 },
        data: `tree:1001:${mock.folderSha}`,
        message
      }
    });
    edits = mock.telegramCalls.filter(
      (call) => call.method === 'editMessageText'
    );
    assert.ok(
      edits
        .at(-1)
        .body.reply_markup.inline_keyboard.flat()
        .some(
          (button) => button.callback_data === `blob:1001:${mock.nestedFileSha}`
        )
    );

    await sendUpdate({
      callback_query: {
        id: 'blob',
        from: { id: 123 },
        data: `blob:1001:${mock.nestedFileSha}`,
        message
      }
    });
    edits = mock.telegramCalls.filter(
      (call) => call.method === 'editMessageText'
    );
    assert.match(edits.at(-1).body.text, /console\.log/);
    assert.equal(edits.at(-1).body.message_id, 702);
    assert.equal(
      mock.telegramCalls.filter((call) => call.method === 'sendMessage').length,
      0
    );
  } finally {
    mock.restore();
  }
});
