import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
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
    body: JSON.stringify(update)
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function installApiMock() {
  const telegramCalls = [];
  const githubCalls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);

    if (value.startsWith('https://api.telegram.org/')) {
      const method = value.split('/').at(-1);
      const body = options.body ? JSON.parse(options.body) : {};
      telegramCalls.push({ method, body });
      return json({ ok: true, result: { message_id: body.message_id || 700, ...body } });
    }

    if (value.startsWith('https://api.github.com/')) {
      githubCalls.push(value);

      if (value.startsWith('https://api.github.com/user/repos?')) {
        return json([{
          name: 'demo',
          full_name: 'davoodmehraban89/demo',
          private: true,
          default_branch: 'main',
          stargazers_count: 0,
          forks_count: 0,
          description: 'Demo repository'
        }]);
      }

      if (value === 'https://api.github.com/repos/davoodmehraban89/demo') {
        return json({
          name: 'demo',
          full_name: 'davoodmehraban89/demo',
          private: true,
          default_branch: 'main',
          archived: false,
          description: 'Demo repository',
          html_url: 'https://github.com/davoodmehraban89/demo'
        });
      }

      if (value === 'https://api.github.com/repos/davoodmehraban89/demo/contents') {
        return json([
          { name: 'src', path: 'src', type: 'dir', size: 0, sha: 'a'.repeat(40) },
          { name: 'README.md', path: 'README.md', type: 'file', size: 100, sha: 'b'.repeat(40) }
        ]);
      }

      if (value === 'https://api.github.com/repos/davoodmehraban89/demo/commits?per_page=5') {
        return json([{
          sha: '1234567890abcdef',
          commit: { message: 'fix mobile menu', author: { name: 'Davood', date: '2026-10-02T10:00:00Z' } },
          author: { login: 'davoodmehraban89' }
        }]);
      }

      if (value === 'https://api.github.com/repos/davoodmehraban89/demo/pulls?state=all&per_page=10') {
        return json([{
          number: 7,
          title: 'Improve bot UI',
          state: 'open',
          merged_at: null,
          created_at: '2026-10-02T10:00:00Z',
          html_url: 'https://github.com/davoodmehraban89/demo/pull/7',
          user: { login: 'davoodmehraban89' }
        }]);
      }

      if (value === 'https://api.github.com/repos/davoodmehraban89/demo/actions/runs?per_page=3') {
        return json({
          workflow_runs: [{
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            head_commit: { message: 'fix mobile menu' },
            html_url: 'https://github.com/davoodmehraban89/demo/actions/runs/1'
          }]
        });
      }

      return json({ message: 'Not Found' }, 404);
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

test('single-message navigation edits the same Telegram message across menu layers', async () => {
  const mock = installApiMock();
  try {
    await sendUpdate({
      message: { message_id: 1, from: { id: 123 }, chat: { id: 123 }, text: '/start' }
    });

    const initial = mock.telegramCalls.find(call => call.method === 'sendMessage');
    assert.ok(initial);
    assert.match(initial.body.text, /Nexa Dev Bot/);

    const menuMessage = { message_id: 700, chat: { id: 123 } };

    await sendUpdate({
      callback_query: { id: 'repos', from: { id: 123 }, data: 'menu:repos', message: menuMessage }
    });
    await sendUpdate({
      callback_query: { id: 'repo', from: { id: 123 }, data: 'repo:demo', message: menuMessage }
    });
    await sendUpdate({
      callback_query: { id: 'back', from: { id: 123 }, data: 'menu:repos', message: menuMessage }
    });
    await sendUpdate({
      callback_query: { id: 'home', from: { id: 123 }, data: 'menu:main', message: menuMessage }
    });

    const edits = mock.telegramCalls.filter(call => call.method === 'editMessageText');
    assert.equal(edits.length, 4);
    assert.ok(edits.every(call => call.body.message_id === 700));
    assert.match(edits[0].body.text, /فهرست مخزن‌ها/);
    assert.match(edits[1].body.text, /پروژه: demo/);
    assert.match(edits[3].body.text, /Nexa Dev Bot/);

    const postStartSends = mock.telegramCalls.filter(call => call.method === 'sendMessage');
    assert.equal(postStartSends.length, 1, 'callbacks must not create extra chat messages');
  } finally {
    mock.restore();
  }
});

test('repository activity views use live GitHub responses and edit in place', async () => {
  const mock = installApiMock();
  try {
    const menuMessage = { message_id: 701, chat: { id: 123 } };
    for (const data of ['files:demo', 'commits:demo', 'pr:demo', 'status:demo']) {
      await sendUpdate({
        callback_query: { id: data, from: { id: 123 }, data, message: menuMessage }
      });
    }

    const edits = mock.telegramCalls.filter(call => call.method === 'editMessageText');
    assert.equal(edits.length, 4);
    assert.match(edits[0].body.text, /README\.md/);
    assert.match(edits[1].body.text, /fix mobile menu/);
    assert.match(edits[2].body.text, /#7/);
    assert.match(edits[2].body.text, /Improve bot UI/);
    assert.match(edits[3].body.text, /CI/);
    assert.ok(mock.githubCalls.some(url => url.startsWith('https://api.github.com/user/repos?')) === false);
  } finally {
    mock.restore();
  }
});

test('/repos uses authenticated repository discovery and renders the API result', async () => {
  const mock = installApiMock();
  try {
    await sendUpdate({
      message: { message_id: 1, from: { id: 123 }, chat: { id: 123 }, text: '/repos' }
    });

    const sent = mock.telegramCalls.find(call => call.method === 'sendMessage');
    assert.ok(sent);
    const buttons = sent.body.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some(button => button.text.includes('demo')));
    assert.ok(buttons.some(button => button.callback_data === 'repo:demo'));
    assert.ok(mock.githubCalls.some(url => url.startsWith('https://api.github.com/user/repos?')));
  } finally {
    mock.restore();
  }
});
