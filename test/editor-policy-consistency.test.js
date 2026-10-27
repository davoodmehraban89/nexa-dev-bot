import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramClient } from '../src/telegram.js';

test('default document upload accepts a valid editor-sized draft above the old 12KB ceiling', async () => {
  const text = 'a'.repeat(15000);
  const client = new TelegramClient('test-only-token', {
    fetch: async (url) =>
      String(url).endsWith('/getFile')
        ? Response.json({
            ok: true,
            result: { file_path: 'documents/draft.txt', file_size: 15000 }
          })
        : new Response(text)
  });
  assert.equal((await client.downloadTextFile('test-file')).text, text);
});

test('default document upload rejects content above the current editor byte ceiling before downloading', async () => {
  let calls = 0;
  const client = new TelegramClient('test-only-token', {
    fetch: async () => {
      calls++;
      return Response.json({
        ok: true,
        result: { file_path: 'documents/draft.txt', file_size: 65537 }
      });
    }
  });
  await assert.rejects(client.downloadTextFile('test-file'), /65536/);
  assert.equal(calls, 1);
});
