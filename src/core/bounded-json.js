export async function readBoundedJson(request, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid request body limit');
  const header = request.headers.get('content-length');
  if (header !== null && (!/^(0|[1-9][0-9]*)$/.test(header) || Number(header) > maxBytes)) {
    throw new RangeError('Editor request body is too large');
  }
  if (!request.body) throw new SyntaxError('Editor request body must be valid JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new RangeError('Editor request body is too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new SyntaxError('Editor request body must be valid JSON'); }
}
