export const DEFAULT_CONFIG = {
  defaultOwner: 'davoodmehraban89',
  workspaceEditorUrl:
    'https://nexa-dev-bot.davoodmehraban89.workers.dev/workspace/editor',
  devTools: [
    {
      id: 'ping',
      title: '🏓 بررسی مسیر داخلی ربات',
      desc: 'تأیید می‌کند callback و رندر داخلی پاسخ می‌دهند؛ latency شبکه یا سلامت سرویس خارجی را اندازه‌گیری نمی‌کند.'
    }
  ]
};

export function workspaceEditorUrl(
  configured = DEFAULT_CONFIG.workspaceEditorUrl
) {
  if (typeof configured !== 'string' || !configured.trim()) return '';
  try {
    const url = new URL(configured);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/workspace/editor'
    )
      return '';
    return url.href;
  } catch {
    return '';
  }
}
