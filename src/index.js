import { NexaDevBot } from './bot.js';
import { DurableWorkspaceStoreClient } from './core/workspace-store.js';
import { handleWorkspaceEditorRequest, workspaceEditorPageResponse } from './workspace-editor.js';
export { ApprovalReplayGuard } from './durable/approval-replay-guard.js';
export { WorkspaceStore } from './durable/workspace-store.js';

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

function safeErrorMessage(error, env = {}) {
  let message = String(error?.message || 'Unknown error');
  for (const secret of [
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_WEBHOOK_SECRET,
    env.GITHUB_TOKEN,
    env.APPROVAL_SIGNING_SECRET
  ]) {
    const value = String(secret || '');
    if (value) message = message.split(value).join('[REDACTED]');
  }
  return message;
}

/**
 * Cloudflare Worker entrypoint.
 * Security invariants:
 * - Telegram webhook requests must carry the configured secret header.
 * - Telegram updates are owner-only and unauthorized senders are ignored silently.
 * - Workspace Mini App API validates Telegram initData, freshness and owner identity.
 * - Mini App saves only the durable Draft; GitHub writes remain behind Safe Approval.
 * - Missing security or transport configuration fails closed.
 */
export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/workspace/editor') {
      return workspaceEditorPageResponse();
    }

    if (url.pathname === '/workspace/api/editor' && (request.method === 'GET' || request.method === 'PUT')) {
      const workspaces = new DurableWorkspaceStoreClient({ namespace: env.WORKSPACE_STORE });
      return handleWorkspaceEditorRequest(request, {
        workspaces,
        botToken: env.TELEGRAM_BOT_TOKEN || '',
        ownerId: env.OWNER_TELEGRAM_ID || ''
      });
    }

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
        const safeError = safeErrorMessage(err, env);
        console.error('telegram_webhook_error', safeError);
        return jsonResponse({ ok: false, error: 'Telegram webhook processing failed' }, 400);
      }
    }

    if (request.method === 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }
};
