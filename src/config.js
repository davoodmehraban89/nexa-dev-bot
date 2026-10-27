export const DEFAULT_CONFIG = {
  defaultOwner: 'davoodmehraban89',
  workspaceEditorUrl:
    'https://nexa-dev-bot.davoodmehraban89.workers.dev/workspace/editor',
  studioAppUrl: 'https://nexa-dev-bot.davoodmehraban89.workers.dev/studio/',
  devTools: [
    {
      id: 'ping',
      title: '🏓 بررسی مسیر داخلی ربات',
      desc: 'تأیید می‌کند callback و رندر داخلی پاسخ می‌دهند؛ latency شبکه یا سلامت سرویس خارجی را اندازه‌گیری نمی‌کند.'
    }
  ]
};

export function studioAppUrl(configured = DEFAULT_CONFIG.studioAppUrl) {
  if (
    typeof configured !== 'string' ||
    !configured.trim() ||
    configured.includes('?') ||
    configured.includes('#')
  )
    return '';
  try {
    const url = new URL(configured);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['/studio', '/studio/'].includes(url.pathname)
    )
      return '';
    url.pathname = '/studio/';
    return url.href;
  } catch {
    return '';
  }
}

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
