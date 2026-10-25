import { KillSwitchGuidedNexaDevBot } from './kill-switch-bot.js';
import { DurableWorkspaceStoreClient } from './core/workspace-store.js';
import { RELEASE_VERSION } from './version.js';
import { GitHubService } from './github.js';
import {
  consumeTelegramUpdate,
  telegramBotIdentity
} from './core/telegram-update-guard.js';
import {
  handleWorkspaceEditorRequest,
  workspaceEditorPageResponse
} from './workspace-editor.js';
export { ApprovalReplayGuard } from './durable/approval-replay-guard.js';
export { WorkspaceStore } from './durable/workspace-store.js';
export { IncidentStore } from './durable/incident-store.js';
export { AutomationStore } from './durable/automation-store.js';
export { KillSwitchStore } from './durable/kill-switch-store.js';
const jsonResponse = (p, s = 200) =>
  new Response(JSON.stringify(p), {
    status: s,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
const publicHealthPayload = () => ({
  status: 'online',
  bot: 'Nexa Dev Bot',
  version: RELEASE_VERSION,
  mode: 'Cloudflare Worker Webhook'
});
const senderIdFromUpdate = (u) =>
  u?.message?.from?.id ??
  u?.edited_message?.from?.id ??
  u?.callback_query?.from?.id ??
  null;
const isOwnerUpdate = (u, e) =>
  !!e.OWNER_TELEGRAM_ID &&
  senderIdFromUpdate(u) !== null &&
  String(senderIdFromUpdate(u)) === String(e.OWNER_TELEGRAM_ID);
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/workspace/editor')
      return workspaceEditorPageResponse();
    if (
      url.pathname === '/workspace/api/editor' &&
      (request.method === 'GET' || request.method === 'PUT')
    )
      return handleWorkspaceEditorRequest(request, {
        workspaces: new DurableWorkspaceStoreClient({
          namespace: env.WORKSPACE_STORE
        }),
        github: new GitHubService(env.GITHUB_TOKEN || '', env.GITHUB_OWNER),
        botToken: env.TELEGRAM_BOT_TOKEN || '',
        ownerId: env.OWNER_TELEGRAM_ID || ''
      });
    if (request.method === 'GET') {
      if (url.pathname === '/health')
        return new Response('ok', {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'no-store'
          }
        });
      if (['/', '/status'].includes(url.pathname))
        return jsonResponse(publicHealthPayload());
      return new Response('Not Found', { status: 404 });
    }
    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      if (!env.TELEGRAM_WEBHOOK_SECRET)
        return new Response('Webhook secret not configured', { status: 503 });
      if (
        request.headers.get('X-Telegram-Bot-Api-Secret-Token') !==
        env.TELEGRAM_WEBHOOK_SECRET
      )
        return new Response('Forbidden', { status: 403 });
      if (!env.OWNER_TELEGRAM_ID)
        return new Response('Owner not configured', { status: 503 });
      if (!env.TELEGRAM_BOT_TOKEN)
        return new Response('Telegram bot token not configured', {
          status: 503
        });
      let update;
      try {
        update = await request.json();
      } catch {
        return jsonResponse(
          { ok: false, error: 'Invalid Telegram update' },
          400
        );
      }
      if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) {
        return jsonResponse(
          { ok: false, error: 'Invalid Telegram update_id' },
          400
        );
      }
      if (!isOwnerUpdate(update, env))
        return jsonResponse({ ok: true, ignored: true });
      try {
        const accepted = await consumeTelegramUpdate({
          namespace: env.APPROVAL_REPLAY_GUARD,
          botId: await telegramBotIdentity(env.TELEGRAM_BOT_TOKEN),
          updateId: update.update_id
        });
        if (!accepted) return jsonResponse({ ok: true, duplicate: true });
      } catch {
        console.error(
          'telegram_webhook_guard_error',
          JSON.stringify({ updateId: update.update_id, outcome: 'unavailable' })
        );
        return jsonResponse(
          { ok: false, error: 'Telegram update guard unavailable' },
          503
        );
      }
      // Claim before effects: retries are at-most-once; a process crash after the
      // durable claim can lose this update. No raw update is retained for replay.
      try {
        const result = await new KillSwitchGuidedNexaDevBot({
          ...env,
          WORKSPACE_EDITOR_URL:
            env.WORKSPACE_EDITOR_URL ?? new URL('/workspace/editor', url).href
        }).handleUpdate(update);
        if (result?.ok !== false) return jsonResponse(result);
      } catch {
        // Provider messages can contain tokens or draft text; log metadata only.
      }
      console.error(
        'telegram_webhook_error',
        JSON.stringify({
          updateId: update.update_id,
          outcome: 'processed_error'
        })
      );
      return jsonResponse({
        ok: false,
        processed_error: true,
        error: 'Telegram webhook processing failed'
      });
    }
    return new Response(
      request.method === 'POST' ? 'Not Found' : 'Method Not Allowed',
      { status: request.method === 'POST' ? 404 : 405 }
    );
  }
};
