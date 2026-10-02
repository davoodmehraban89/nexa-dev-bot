import { NexaDevBot } from './bot.js';

/**
 * Cloudflare Worker Export & Universal HTTP Handler
 */
export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);

    // Health check & root route
    if (request.method === 'GET') {
      if (url.pathname === '/health' || url.pathname === '/') {
        return new Response(JSON.stringify({
          status: 'online',
          bot: 'Nexa Dev Bot',
          version: '1.1.0',
          mode: 'Cloudflare Worker Webhook',
          uptime: '100% SLA'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/status') {
        const bot = new NexaDevBot(env);
        const statusView = bot.menu.getServiceStatusView();
        return new Response(JSON.stringify(statusView), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });
    }

    // Webhook POST from Telegram
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        const bot = new NexaDevBot(env);
        const result = await bot.handleUpdate(update);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });
  }
};
