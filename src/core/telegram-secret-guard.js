const GITHUB_TOKEN_PREFIX = /^\s*(?:github_pat_|gh[pousr]_)/;
const REVOCATION_WARNING =
  '⚠️ <b>توکن در چت قرار گرفت و باید در GitHub باطل شود</b>\n' +
  'همین حالا توکن را از صفحه مربوط در GitHub باطل کنید:\n' +
  '<a href="https://github.com/settings/personal-access-tokens">توکن‌های Fine-grained</a>\n' +
  '<a href="https://github.com/settings/tokens">سایر توکن‌ها</a>\n\n' +
  'توکن را فقط داخل Mini App وارد کنید.';

export function containsGitHubTokenMessage(message) {
  return [message?.text, message?.caption].some(
    (value) => typeof value === 'string' && GITHUB_TOKEN_PREFIX.test(value)
  );
}

export async function interceptTelegramSecretMessage({
  message,
  telegram,
  ownerId
} = {}) {
  if (!containsGitHubTokenMessage(message)) return null;
  // This guard must not introduce an alternate route around the owner boundary.
  if (
    !ownerId ||
    message?.from?.id === undefined ||
    message?.from?.id === null ||
    String(message.from.id) !== String(ownerId)
  )
    return { ok: true, ignored: true };

  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  let deleted = false;
  let warned = false;
  if (Number.isSafeInteger(chatId) && Number.isSafeInteger(messageId)) {
    // Delete is the first effect. Never send raw content, persist it, or expose
    // provider errors: both Telegram response bodies and errors may echo input.
    try {
      await telegram.deleteMessage(chatId, messageId);
      deleted = true;
    } catch {}
    const warning = deleted
      ? REVOCATION_WARNING
      : `${REVOCATION_WARNING}\n\nحذف خودکار پیام تأیید نشد؛ پیام را نیز دستی حذف کنید.`;
    try {
      await telegram.sendMessage(chatId, warning);
      warned = true;
    } catch {}
  }
  return { ok: true, secretRejected: true, deleted, warned };
}
