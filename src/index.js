import { NexaDevBot } from './bot.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
});

function senderIdFromUpdate(update) {
  return update?.message?.from?.id ?? update?.callback_query?.from?.id ?? null;
}

function isOwnerUpdate(update, env) {
  if (!env.OWNER_TELEGRAM_ID) return false;
  const senderId = senderIdFromUpdate(update);
  return senderId !== null && String(senderId) === String(env.OWNER_TELEGRAM_ID);
}

/**
 * Cloudflare Worker entrypoint.
 * Security invariants:
 * - Telegram webhook requests must carry the configured secret header.
 * - Telegram updates are owner-only and unauthorized senders are ignored silently.
 * - Missing security or transport configuration fails closed.
 */
export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      if (url.pathname === '/health' || url.pathname === '/') {
        return jsonResponse({
          status: 'online',
          bot: 'Nexa Dev Bot',
          version: '1.1.1',
          mode: 'Cloudflare Worker Webhook'
        });
      }

      if (url.pathname === '/status') {
        const bot = new NexaDevBot(env);
        const statusView = bot.menu.getServiceStatusView();
        return jsonResponse(statusView);
      }

      return new Response('Not Found', { status: 404 });
    }

    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      if (!env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Webhook secret not configured', { status: 503 });
      }

      const suppliedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!env.OWNER_TELEGRAM_ID) {
        return new Response('Owner not configured', { status: 503 });
      }

      if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response('Telegram bot token not configured', { status: 503 });
      }

      try {
        const update = await request.json();

        if (!isOwnerUpdate(update, env)) {
          return jsonResponse({ ok: true, ignored: true });
        }

        const bot = new NexaDevBot(env);
        const result = await bot.handleUpdate(update);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 400);
      }
    }

    if (request.method === 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }
};
