const encoder = new TextEncoder();

async function hmacSha256(keyBytes, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(String(value)))
  );
}

const hex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function timingSafeHexEqual(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1)
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function validateTelegramWebAppInitData(
  initData,
  { botToken, ownerId, now = () => Date.now(), maxAgeSeconds = 3600 } = {}
) {
  const token = String(botToken || '');
  const owner = String(ownerId || '');
  if (!token) throw new Error('Mini App bot token is not configured');
  if (!owner) throw new Error('Mini App owner is not configured');

  const params = new URLSearchParams(String(initData || ''));
  const suppliedHash = params.get('hash') || '';
  if (!suppliedHash) throw new Error('Mini App initData hash is missing');

  const pairs = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Telegram Mini Apps validation: HMAC_SHA256(key="WebAppData", data=bot_token),
  // then HMAC_SHA256(key=secret_key, data=data_check_string).
  const secretKey = await hmacSha256(encoder.encode('WebAppData'), token);
  const expectedHash = hex(await hmacSha256(secretKey, dataCheckString));
  if (!timingSafeHexEqual(expectedHash, suppliedHash)) {
    throw new Error('Mini App initData signature is invalid');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0)
    throw new Error('Mini App auth_date is invalid');
  const currentSeconds = Math.floor(Number(now()) / 1000);
  const age = currentSeconds - authDate;
  if (!Number.isFinite(age) || age < -60 || age > Number(maxAgeSeconds)) {
    throw new Error('Mini App auth_date is expired or stale');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    throw new Error('Mini App user data is invalid');
  }
  const userId = String(user?.id ?? '');
  if (!userId) throw new Error('Mini App user is missing');
  if (userId !== owner) throw new Error('Mini App owner validation failed');

  return { userId, authDate, user };
}
