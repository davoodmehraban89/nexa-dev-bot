import { TelegramClient } from './telegram.js';
import { GitHubService } from './github.js';
import { MenuManager } from './menu.js';
import { PluginRegistry } from './core/plugin-registry.js';
import { ActionPolicy } from './core/action-policy.js';
import { ApprovalService } from './core/approval.js';
import { DurableApprovalReplayStore } from './core/durable-replay-store.js';
import { DurableWorkspaceStoreClient } from './core/workspace-store.js';
import { AuditLogger } from './core/audit.js';
import { PluginRouter } from './core/router.js';
import { buildCallbackFailureView } from './core/callback-failure-view.js';
import { createGitHubPlugin } from './plugins/github/plugin.js';

const INTENT_ID_PATTERN = /^[A-Za-z0-9_-]{8}$/;
const QUICK_MENU = Object.freeze({
  '🏠 منوی اصلی': 'main',
  '📁 پروژه‌ها': 'repos',
  '📊 وضعیت': 'status',
  '🔧 ابزارها': 'tools',
  '🔐 امنیت': 'security'
});
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function persistentQuickMenuMarkup() {
  return {
    keyboard: [
      [{ text: '🏠 منوی اصلی' }, { text: '📁 پروژه‌ها' }],
      [{ text: '📊 وضعیت' }, { text: '🔧 ابزارها' }],
      [{ text: '🔐 امنیت' }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Nexa Dev — یک گزینه را انتخاب کنید'
  };
}

function focusedCodeInputMarkup() {
  return {
    force_reply: true,
    selective: true,
    input_field_placeholder: 'کد یا متن را اینجا Paste کنید…'
  };
}

function approvalSourceCallback(payload = {}) {
  const repoId = payload.input?.repoId;
  if (!Number.isSafeInteger(Number(repoId))) throw new Error('Approval input is invalid');

  if (payload.actionId === 'github.workspace.commit_branch') {
    const intentId = String(payload.input?.intentId || '');
    if (!INTENT_ID_PATTERN.test(intentId)) throw new Error('Approval input is invalid');
    return `wscommit:${repoId}:${intentId}`;
  }

  const runId = payload.input?.runId;
  if (!Number.isSafeInteger(Number(runId))) throw new Error('Approval input is invalid');
  if (payload.actionId === 'github.workflow.run.rerun_failed') return `rerun:${repoId}:${runId}`;
  if (payload.actionId === 'github.workflow.run.cancel') return `cancelrun:${repoId}:${runId}`;
  throw new Error('Approval action is not supported');
}

function approvalView({ label, token, cancelCallback = 'menu:main' }) {
  return {
    text:
`⚠️ <b>تأیید عملیات لازم است</b>
➖➖➖➖➖➖➖➖➖➖
عملیات: <b>${label}</b>
این عملیات روی GitHub تغییر ایجاد می‌کند و فقط پس از تأیید شما اجرا می‌شود.

اگر مطمئن هستید، «تأیید و اجرا» را بزنید.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ تأیید و اجرا', callback_data: `approve:${token}` }],
        [{ text: '↩️ انصراف', callback_data: cancelCallback }]
      ]
    }
  };
}

function approvalRejectedView(message, error) {
  const reason = String(error?.message || 'Approval rejected');
  const expired = /expired/i.test(reason);
  const used = /already used|replay/i.test(reason);
  const fallback = message?.reply_markup?.inline_keyboard
    ?.flat()
    .map(button => String(button?.callback_data || ''))
    .find(callback => callback && !callback.startsWith('approve:')) || 'menu:main';

  let detail = 'این تأیید معتبر نیست و هیچ تغییری اجرا نشد.';
  if (expired) detail = 'مهلت این تأیید تمام شده است و هیچ تغییری اجرا نشد.';
  if (used) detail = 'این تأیید قبلاً استفاده شده است و دوباره اجرا نمی‌شود.';
  const backText = fallback.startsWith('run:') ? '↩️ بازگشت به Run' : '↩️ بازگشت';

  return {
    text:
`⚠️ <b>عملیات اجرا نشد</b>
➖➖➖➖➖➖➖➖➖➖
${detail}

برای ادامه برگردید و در صورت نیاز یک تأیید تازه ایجاد کنید.`,
    reply_markup: { inline_keyboard: [[{ text: backText, callback_data: fallback }]] }
  };
}

function approvedActionFailedView(payload, error) {
  const reason = String(error?.message || 'GitHub operation failed');
  const permissionDenied = /403|resource not accessible by personal access token/i.test(reason);
  const repoId = payload?.input?.repoId;
  const runId = payload?.input?.runId;
  const workspaceAction = payload?.actionId === 'github.workspace.commit_branch';
  const fallback = workspaceAction && Number.isSafeInteger(Number(repoId))
    ? `repo:${repoId}`
    : Number.isSafeInteger(Number(repoId)) && Number.isSafeInteger(Number(runId))
      ? `run:${repoId}:${runId}`
      : 'menu:main';
  const detail = workspaceAction
    ? permissionDenied
      ? 'تأیید شما معتبر بود، اما GitHub درخواست Commit شاخه را با خطای 403 رد کرد. دسترسی Contents WRITE توکن فعلی را بررسی کنید.'
      : `تأیید شما معتبر بود، اما Commit شاخه انجام نشد: ${escapeHtml(reason)}`
    : permissionDenied
      ? 'تأیید شما معتبر بود، اما GitHub درخواست را با خطای 403 رد کرد. دسترسی توکن فعلی برای GitHub Actions WRITE کافی نیست.'
      : 'تأیید شما معتبر بود، اما GitHub عملیات را موفق اعلام نکرد. وضعیت Run را بررسی کنید.';
  return {
    text:
`⚠️ <b>اجرای عملیات در GitHub ناموفق بود</b>
➖➖➖➖➖➖➖➖➖➖
${detail}

این تأیید یک‌بار مصرف شده و با همان دکمه دوباره اجرا نمی‌شود.`,
    reply_markup: { inline_keyboard: [[{ text: workspaceAction ? '↩️ بازگشت به پروژه' : '↩️ بازگشت به Run', callback_data: fallback }]] }
  };
}

function callbackReadFailedView(data, error) {
  const reason = String(error?.message || 'Provider read failed');
  const permissionDenied = /403|resource not accessible by personal access token/i.test(reason);
  const repoMatch = String(data || '').match(/^[^:]+:(\d+)/);
  const fallback = repoMatch ? `repo:${repoMatch[1]}` : 'menu:main';
  const isIssues = String(data || '').startsWith('issues:');
  const detail = permissionDenied
    ? isIssues
      ? 'GitHub درخواست Issues را با خطای 403 رد کرد. در Fine-grained token، مجوز Repository permissions → Issues را روی Read قرار دهید.'
      : 'GitHub این درخواست خواندنی را با خطای 403 رد کرد. مجوز Read مربوط به این بخش در توکن فعلی کافی نیست.'
    : 'دریافت اطلاعات از سرویس با خطا مواجه شد. هیچ تغییری انجام نشد.';
  return {
    text:
`⚠️ <b>دریافت اطلاعات با خطا مواجه شد</b>
➖➖➖➖➖➖➖➖➖➖
${detail}

این خطا هیچ عملیات تغییردهنده‌ای اجرا نکرد.`,
    reply_markup: { inline_keyboard: [[{ text: repoMatch ? '↩️ بازگشت به پروژه' : '↩️ منوی اصلی', callback_data: fallback }]] }
  };
}

export class NexaDevBot {
  constructor(env = {}) {
    this.env = env;
    this.telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN || '');
    this.github = new GitHubService(env.GITHUB_TOKEN || '', env.GITHUB_OWNER || 'davoodmehraban89');
    this.menu = new MenuManager(this.github);
    this.replayStore = new DurableApprovalReplayStore({ namespace: env.APPROVAL_REPLAY_GUARD });
    this.workspaceStore = new DurableWorkspaceStoreClient({ namespace: env.WORKSPACE_STORE });
    this.approvals = new ApprovalService({
      secret: env.APPROVAL_SIGNING_SECRET || env.TELEGRAM_WEBHOOK_SECRET || '',
      replayStore: this.replayStore
    });
    this.githubPlugin = createGitHubPlugin({
      github: this.github,
      menu: this.menu,
      workspaces: this.workspaceStore.isConfigured() ? this.workspaceStore : null
    });
    this.registry = new PluginRegistry([this.githubPlugin]);
    this.policy = new ActionPolicy();
    this.audit = new AuditLogger({
      secrets: [env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_WEBHOOK_SECRET, env.GITHUB_TOKEN, env.APPROVAL_SIGNING_SECRET]
    });
    this.router = new PluginRouter({ registry: this.registry, policy: this.policy, audit: this.audit });
  }

  async handleUpdate(update) {
    if (!update) return { ok: false, error: 'Empty update' };
    if (update.callback_query) return this.handleCallbackQuery(update.callback_query);
    if (update.message) return this.handleMessage(update.message);
    return { ok: true, ignored: true };
  }

  async handleCallbackQuery(query) {
    const callbackId = query.id;
    const data = query.data || 'menu:main';
    const message = query.message;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;
    const ownerId = query.from?.id;

    let callbackAnswered = true;
    try { await this.telegram.answerCallbackQuery(callbackId); } catch { callbackAnswered = false; }
    if (!chatId || !messageId) return { ok: false, error: 'Missing message context for callback', callbackAnswered };

    try {
      if (data.startsWith('approve:')) {
        if (ownerId === undefined || ownerId === null) throw new Error('Approval owner is required');
        const token = data.slice('approve:'.length);
        let payload;
        try {
          payload = await this.approvals.consume(token, { ownerId: String(ownerId), pluginId: 'github', risk: 'WRITE' });
        } catch (error) {
          this.audit.log({ event: 'approval_rejected', pluginId: 'github', risk: 'WRITE', outcome: 'rejected', error: error?.message || 'Approval rejected' });
          const view = approvalRejectedView(message, error);
          const res = await this.telegram.editMessageText(chatId, messageId, view.text, view.reply_markup);
          return { ok: false, approvalRejected: true, error: error?.message || 'Approval rejected', callbackAnswered, edited: true, res };
        }

        this.audit.log({ event: 'approval_verified', pluginId: payload.pluginId, actionId: payload.actionId, risk: payload.risk, outcome: 'verified' });
        const sourceCallback = approvalSourceCallback(payload);
        let routed;
        try {
          routed = await this.router.dispatchCallback(sourceCallback, {
            isOwner: true,
            ownerId: String(ownerId),
            approved: true
          });
          if (!routed || routed.requiresApproval || routed.denied) throw new Error('Approved action could not be dispatched');
        } catch (error) {
          const view = approvedActionFailedView(payload, error);
          const res = await this.telegram.editMessageText(chatId, messageId, view.text, view.reply_markup);
          return { ok: false, approved: true, providerError: true, actionId: payload.actionId, error: error?.message || 'GitHub operation failed', callbackAnswered, edited: true, res };
        }

        const res = await this.telegram.editMessageText(chatId, messageId, routed.text, routed.reply_markup);
        return { ok: true, approved: true, actionId: payload.actionId, callbackAnswered, edited: true, res };
      }

      const routed = await this.router.dispatchCallback(data, {
        isOwner: true,
        ownerId: ownerId === undefined || ownerId === null ? '' : String(ownerId)
      });
      if (routed?.requiresApproval) {
        const approval = routed.approval;
        const repoId = approval?.input?.repoId;
        if (!approval || !Number.isSafeInteger(Number(repoId))) throw new Error('Approval metadata is missing');
        const workspaceApproval = routed.actionId === 'github.workspace.commit_branch';
        const runId = approval?.input?.runId;
        const intentId = String(approval?.input?.intentId || '');
        if (workspaceApproval) {
          if (!INTENT_ID_PATTERN.test(intentId)) throw new Error('Approval metadata is missing');
        } else if (!Number.isSafeInteger(Number(runId))) {
          throw new Error('Approval metadata is missing');
        }
        if (ownerId === undefined || ownerId === null) throw new Error('Approval owner is required');
        if (!this.approvals.isReplayProtected()) throw new Error('Durable approval replay protection is not configured');

        const token = await this.approvals.issue({
          pluginId: routed.pluginId,
          actionId: routed.actionId,
          risk: routed.risk,
          ownerId: String(ownerId),
          input: approval.input
        });
        this.audit.log({ event: 'approval_issued', pluginId: routed.pluginId, actionId: routed.actionId, risk: routed.risk, outcome: 'pending' });
        const cancelCallback = approval.cancelCallback || (Number.isSafeInteger(Number(runId)) ? `run:${repoId}:${runId}` : `repo:${repoId}`);
        const view = approvalView({ label: approval.label || routed.actionId, token, cancelCallback });
        const res = await this.telegram.editMessageText(chatId, messageId, view.text, view.reply_markup);
        return { ok: true, approvalRequired: true, actionId: routed.actionId, risk: routed.risk, callbackAnswered, edited: true, res };
      }
      if (routed?.denied) return { ok: false, denied: true, actionId: routed.actionId, reason: routed.reason, callbackAnswered };

      const view = routed || await this.menu.renderByCallback(data);
      if (data.startsWith('wtext:') && routed) {
        const res = await this.telegram.sendMessage(chatId, view.text, focusedCodeInputMarkup());
        return { ok: true, inputPrompt: true, callbackAnswered, sent: true, res };
      }
      const res = await this.telegram.editMessageText(chatId, messageId, view.text, view.reply_markup);
      return { ok: true, edited: true, callbackAnswered, res };
    } catch (err) {
      if (err.message && err.message.includes('message is not modified')) return { ok: true, unmodified: true, callbackAnswered };
      if (!data.startsWith('approve:')) {
        try {
          const view = await buildCallbackFailureView({ data, error: err, ownerId, workspaces: this.workspaceStore });
          const res = await this.telegram.editMessageText(chatId, messageId, view.text, view.reply_markup);
          return {
            ok: false,
            error: err.message,
            providerError: !view.validationError,
            validationError: Boolean(view.validationError),
            callbackAnswered,
            edited: true,
            res
          };
        } catch {
          // Preserve the original provider/navigation error when feedback delivery also fails.
        }
      }
      return { ok: false, error: err.message, callbackAnswered };
    }
  }

  async handleMessage(message) {
    const chatId = message.chat?.id;
    const rawText = typeof message.text === 'string' ? message.text : '';
    const text = rawText.trim();
    if (!chatId) return { ok: false, error: 'Missing chat_id' };

    if (text === '/start' || text === '/menu' || text.startsWith('/start')) {
      const quickMenuRes = await this.telegram.sendMessage(
        chatId,
        '⌨️ <b>منوی سریع Nexa Dev فعال شد</b>\nاین منو پایین صفحه می‌ماند و از هر بخش قابل استفاده است.',
        persistentQuickMenuMarkup()
      );
      const view = this.menu.getMainMenuView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, command: 'start', persistentMenu: true, quickMenuRes, res };
    }

    const quickMenu = QUICK_MENU[text];
    if (quickMenu) {
      let view;
      if (quickMenu === 'main') {
        view = this.menu.getMainMenuView();
      } else if (quickMenu === 'repos') {
        const routed = await this.router.dispatchCommand('/repos', { isOwner: true });
        if (routed?.requiresApproval || routed?.denied || !routed) {
          return { ok: false, quickMenu, error: routed?.reason || 'GitHub repository route unavailable' };
        }
        view = routed;
      } else if (quickMenu === 'status') {
        view = this.menu.getServiceStatusView();
      } else if (quickMenu === 'tools') {
        view = this.menu.getToolsView();
      } else {
        view = this.menu.getSecurityView();
      }
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, quickMenu, res };
    }

    if (text === '/repos') {
      const routed = await this.router.dispatchCommand(text, { isOwner: true });
      if (routed?.requiresApproval || routed?.denied || !routed) {
        return { ok: false, command: 'repos', error: routed?.reason || 'GitHub repository route unavailable' };
      }
      const res = await this.telegram.sendMessage(chatId, routed.text, routed.reply_markup);
      return { ok: true, command: 'repos', res };
    }

    if (text === '/status') {
      const view = this.menu.getServiceStatusView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, command: 'status', res };
    }

    const ownerId = message.from?.id;
    if (ownerId !== undefined && ownerId !== null && this.workspaceStore.isConfigured()) {
      const pending = await this.workspaceStore.getPendingInput({ ownerId: String(ownerId) });
      if (pending) {
        let payload = { pending, text: rawText };
        if (pending.mode === 'draft_file') {
          const document = message.document;
          if (!document?.file_id) {
            const view = {
              text: '📎 <b>یک فایل متنی ارسال کنید</b>\nاین Workspace در حالت بارگذاری فایل است. فایل باید UTF-8 معتبر و حداکثر 12,000 بایت باشد.',
              reply_markup: { inline_keyboard: [[{ text: '↩️ بازگشت به Draft', callback_data: `ws:${pending.workspaceId}` }]] }
            };
            const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
            return { ok: true, workspaceInput: true, inputRequired: 'document', res };
          }
          if (Number.isFinite(Number(document.file_size)) && Number(document.file_size) > 12000) {
            const view = {
              text: '⚠️ <b>فایل پذیرفته نشد</b>\nحجم فایل بیشتر از سقف 12,000 بایت است. Draft تغییر نکرد؛ یک فایل کوچک‌تر ارسال کنید.',
              reply_markup: { inline_keyboard: [[{ text: '↩️ بازگشت به Draft', callback_data: `ws:${pending.workspaceId}` }]] }
            };
            const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
            return { ok: false, workspaceInput: true, inputRejected: true, error: 'Telegram file exceeds 12000 byte size limit', res };
          }
          let downloaded;
          try {
            downloaded = await this.telegram.downloadTextFile(document.file_id, { maxBytes: 12000 });
          } catch (error) {
            const view = {
              text: `⚠️ <b>فایل پذیرفته نشد</b>\n${escapeHtml(error?.message || 'Telegram file download failed')}\n\nDraft تغییر نکرد و می‌توانید فایل دیگری ارسال کنید.`,
              reply_markup: { inline_keyboard: [[{ text: '↩️ بازگشت به Draft', callback_data: `ws:${pending.workspaceId}` }]] }
            };
            const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
            return { ok: false, workspaceInput: true, inputRejected: true, error: error?.message || 'Telegram file download failed', res };
          }
          payload = {
            pending,
            file: {
              name: String(document.file_name || 'uploaded.txt'),
              text: downloaded.text,
              byteLength: downloaded.byteLength
            }
          };
        }

        const routed = await this.router.dispatchMessage(
          payload,
          { isOwner: true, ownerId: String(ownerId) }
        );
        if (routed?.requiresApproval || routed?.denied || !routed) {
          return { ok: false, error: routed?.reason || 'Workspace input route unavailable' };
        }
        const res = await this.telegram.sendMessage(chatId, routed.text, routed.reply_markup);
        return { ok: true, workspaceInput: true, res };
      }
    }

    const defaultText = '💡 برای دسترسی به منوهای پروژه‌ها و ابزارهای Nexa Dev، دکمه زیر را لمس کنید:';
    const view = {
      text: defaultText,
      reply_markup: {
        inline_keyboard: [[{ text: '⚡ باز کردن منوی اصلی Nexa Dev', callback_data: 'menu:main' }]]
      }
    };
    const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
    return { ok: true, default: true, res };
  }
}
