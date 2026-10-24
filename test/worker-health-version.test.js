import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../src/index.js';

test('/health reveals only ok, without release or runtime metadata', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/health'),
    {}
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('/status and / use the package release version', async () => {
  const metadata = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  for (const route of ['/', '/status']) {
    const response = await worker.fetch(
      new Request(`https://example.test${route}`),
      {}
    );
    const body = await response.json();
    assert.equal(body.version, metadata.version);
    assert.deepEqual(Object.keys(body).sort(), [
      'bot',
      'mode',
      'status',
      'version'
    ]);
  }
});
