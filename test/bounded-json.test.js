import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedJson } from '../src/core/bounded-json.js';

const req = (s, headers) => new Request('https://example.com', { method: 'PUT', body: s, headers });

test('valid UTF-8 JSON', async () => assert.deepEqual(await readBoundedJson(req('{"x":"✓"}'), 30), { x: '✓' }));
test('exact byte boundary', async () => assert.deepEqual(await readBoundedJson(req('{}'), 2), {}));
test('one byte over', async () => await assert.rejects(readBoundedJson(req('{}'), 1), RangeError));
test('missing Content-Length still enforces stream cap', async () => {
  const request = req('x'.repeat(100));
  request.headers.delete('content-length');
  await assert.rejects(readBoundedJson(request, 10), RangeError);
});
test('oversized declared length is rejected', async () =>
  await assert.rejects(readBoundedJson(req('{}', { 'content-length': '100' }), 10), RangeError));
test('malformed JSON', async () => await assert.rejects(readBoundedJson(req('{'), 10), SyntaxError));
test('invalid UTF-8', async () => {
  const request = new Request('https://example.com', { method: 'PUT', body: new Uint8Array([255]) });
  await assert.rejects(readBoundedJson(request, 10), SyntaxError);
});
test('empty body', async () =>
  await assert.rejects(readBoundedJson(new Request('https://example.com', { method: 'PUT' }), 10), SyntaxError));
test('invalid maximum', async () => await assert.rejects(readBoundedJson(req('{}'), 0), RangeError));
test('body stream error propagates', async () => {
  const request = new Request('https://example.com', {
    method: 'PUT', duplex: 'half',
    body: new ReadableStream({ pull(controller) { controller.error(new Error('io fail')); } })
  });
  await assert.rejects(readBoundedJson(request, 10), /io fail/);
});
