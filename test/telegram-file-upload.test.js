import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramClient } from '../src/telegram.js';

test('TelegramClient downloads a bounded UTF-8 document through getFile', async () => {
  const seen = [];
  const client = new TelegramClient('token', {
    fetch: async (url, options = {}) => {
      seen.push([String(url), options.method || 'GET', options.body || null]);
      if (String(url).endsWith('/getFile')) {
        assert.deepEqual(JSON.parse(options.body), { file_id: 'FILE123' });
        return Response.json({
          ok: true,
          result: { file_path: 'documents/replacement.txt', file_size: 6 }
        });
      }
      if (
        String(url) ===
        'https://api.telegram.org/file/bottoken/documents/replacement.txt'
      ) {
        return new Response(new TextEncoder().encode('hello\n'), {
          status: 200
        });
      }
      return new Response('unexpected', { status: 500 });
    }
  });

  const file = await client.downloadTextFile('FILE123', { maxBytes: 12000 });
  assert.deepEqual(file, {
    text: 'hello\n',
    byteLength: 6,
    filePath: 'documents/replacement.txt'
  });
  assert.equal(seen.length, 2);
});

test('TelegramClient rejects oversized Telegram documents before downloading bytes', async () => {
  let calls = 0;
  const client = new TelegramClient('token', {
    fetch: async (url) => {
      calls += 1;
      assert.match(String(url), /\/getFile$/);
      return Response.json({
        ok: true,
        result: { file_path: 'documents/huge.txt', file_size: 12001 }
      });
    }
  });

  await assert.rejects(
    () => client.downloadTextFile('HUGE', { maxBytes: 12000 }),
    /12,?000|12000|large|size/i
  );
  assert.equal(calls, 1);
});

test('TelegramClient rejects non-UTF-8 document bytes', async () => {
  const client = new TelegramClient('token', {
    fetch: async (url) => {
      if (String(url).endsWith('/getFile')) {
        return Response.json({
          ok: true,
          result: { file_path: 'documents/binary.bin', file_size: 2 }
        });
      }
      return new Response(Uint8Array.from([0xff, 0xfe]), { status: 200 });
    }
  });

  await assert.rejects(
    () => client.downloadTextFile('BINARY', { maxBytes: 12000 }),
    /UTF-?8|text/i
  );
});
