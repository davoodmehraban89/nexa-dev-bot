export const TELEGRAM_UPDATE_RETENTION_MS = 24 * 60 * 60_000;

export async function telegramBotIdentity(botToken) {
  const token = String(botToken || '');
  if (!token) throw new Error('Telegram bot identity is not configured');
  const numericId = token.match(/^(\d+):/);
  if (numericId) return numericId[1];
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function consumeTelegramUpdate({
  namespace,
  botId,
  updateId,
  now = Date.now
} = {}) {
  if (!Number.isSafeInteger(updateId) || updateId < 0)
    throw new Error('Telegram update_id must be a nonnegative safe integer');
  if (!/^(?:\d+|sha256:[a-f0-9]{64})$/.test(String(botId || '')))
    throw new Error('Telegram bot identity is invalid');
  if (
    !namespace ||
    typeof namespace.idFromName !== 'function' ||
    typeof namespace.get !== 'function'
  ) {
    throw new Error('Telegram update guard is not configured');
  }
  const expiresAt = Number(now()) + TELEGRAM_UPDATE_RETENTION_MS;
  if (!Number.isSafeInteger(expiresAt))
    throw new Error('Telegram update claim expiry is invalid');
  const id = namespace.idFromName(`telegram-webhook:v1:${botId}:${updateId}`);
  const response = await namespace.get(id).fetch(
    new Request('https://approval-replay/telegram/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresAt })
    })
  );
  const body = await response.json().catch(() => null);
  if (
    response.status === 409 &&
    body?.accepted === false &&
    body?.reason === 'duplicate'
  )
    return false;
  if (!response.ok || body?.accepted !== true)
    throw new Error('Telegram update guard claim failed');
  return true;
}
