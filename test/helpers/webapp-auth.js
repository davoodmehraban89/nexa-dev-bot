export async function signedWebAppData({
  userId = 42,
  now = Date.now(),
  botToken = 'test-only-token'
} = {}) {
  const encoder = new TextEncoder();
  async function hmac(key, text) {
    const imported = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return new Uint8Array(
      await crypto.subtle.sign('HMAC', imported, encoder.encode(text))
    );
  }
  const fields = new URLSearchParams({
    auth_date: String(Math.floor(now / 1000)),
    user: JSON.stringify({ id: userId, first_name: 'Test' })
  });
  const check = [...fields.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = await hmac(encoder.encode('WebAppData'), botToken);
  fields.set(
    'hash',
    Array.from(await hmac(secret, check), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')
  );
  return fields.toString();
}
