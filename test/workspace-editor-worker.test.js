import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('Worker serves Workspace Mini App with no-store and a restrictive CSP', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/workspace/editor'),
    {},
    {}
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/i);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'none'/i);
  assert.match(csp, /script-src[^;]*telegram\.org/i);
  assert.match(csp, /connect-src 'self'/i);
  const html = await response.text();
  assert.match(html, /<textarea/i);
  assert.match(html, /telegram-web-app\.js/i);
});

test('Worker editor API rejects requests that do not carry valid Telegram initData', async () => {
  const response = await worker.fetch(
    new Request(
      'https://example.com/workspace/api/editor?workspaceId=W000000001'
    ),
    { TELEGRAM_BOT_TOKEN: '123456:TEST_ONLY_TOKEN', OWNER_TELEGRAM_ID: '42' },
    {}
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /hash|initData|signature/i);
});
