import { TelegramClient } from './telegram.js';
import { GitHubService } from './github.js';
import { MenuManager } from './menu.js';
import { PluginRegistry } from './core/plugin-registry.js';
import { ActionPolicy } from './core/action-policy.js';
import { ApprovalService } from './core/approval.js';
import { DurableApprovalReplayStore } from './core/durable-replay-store.js';
import { AuditLogger } from './core/audit.js';
import { PluginRouter } from './core/router.js';
import { createGitHubPlugin } from './plugins/github/plugin.js';

function approvalSourceCallback(payload = {}) {
  const repoId = payload.input?.repoId;
  const runId = payload.input?.runId;
  if (!Number.isSafeInteger(Number(repoId)) || !Number.isSafeInteger(Number(runId))) {
    throw new Error('Approval input is invalid');
  }

  if (payload.actionId === 'github.workflow.run.rerun_failed') {
    return `rerun:${repoId}:${runId}`;
  }
  if (payload.actionId === 'github.workflow.run.cancel') {
    return `cancelrun:${repoId}:${runId}`;
  }
  throw new Error('Approval action is not supported');
}

function approvalView({ label, token, repoId, runId }) {
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
        [{ text: '↩️ انصراف', callback_data: `run:${repoId}:${runId}` }]
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

  return {
    text:
`⚠️ <b>عملیات اجرا نشد</b>
➖➖➖➖➖➖➖➖➖➖
${detail}

برای ادامه به صفحهٔ Run برگردید و در صورت نیاز یک تأیید تازه ایجاد کنید.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '↩️ بازگشت به Run', callback_data: fallback }]
      ]
    }
  };
}

function approvedActionFailedView(payload, error) {
  const reason = String(error?.message || 'GitHub operation failed');
  const permissionDenied = /403|resource not accessible by personal access token/i.test(reason);
  const repoId = payload?.input?.repoId;
  const runId = payload?.input?.runId;
  const fallback = Number.isSafeInteger(Number(repoId)) && Number.isSafeInteger(Number(runId))
    ? `run:${repoId}:${runId}`
    : 'menu:main';

  const detail = permissionDenied
    ? 'تأیید شما معتبر بود، اما GitHub درخواست را با خطای 403 رد کرد. دسترسی توکن فعلی برای GitHub Actions WRITE کافی نیست.'
    : 'تأیید شما معتبر بود، اما GitHub عملیات را موفق اعلام نکرد. وضعیت Run را بررسی کنید.';

  return {
    text:
`⚠️ <b>اجرای عملیات در GitHub ناموفق بود</b>
➖➖➖➖➖➖➖➖➖➖
${detail}

این تأیید یک‌بار مصرف شده و با همان دکمه دوباره اجرا نمی‌شود.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '↩️ بازگشت به Run', callback_data: fallback }]
      ]
    }
  };
}

function callbackReadFailedView(data, error) {
  const reason = String(error?.message || 'Provider read failed');
  const permissionDenied = /403|resource not accessible by personal access token/i.test(reason);
  const repoMatch = String(data || '').match(/^[^:]+:(\d+)/);
  const fallback = repoMatch ? `repo:${repoMatch[1]}` : 'menu:main';
  const detail = permissionDenied
    ? 'GitHub این درخواست خواندنی را با خطای 403 رد کرد. مجوز Read مربوط به این بخش در توکن فعلی کافی نیست.'
    : 'دریافت اطلاعات از سرویس با خطا مواجه شد. هیچ تغییری انجام نشد.';

  return {
    text:
`⚠️ <b>دریافت اطلاعات با خطا مواجه شد</b>
➖➖➖➖➖➖➖➖➖➖
${detail}

این خطا هیچ عملیات تغییردهنده‌ای اجرا نکرد.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: repoMatch ? '↩️ بازگشت به پروژه' : '↩️ منوی اصلی', callback_data: fallback }]
      ]
    }
  };
}

export class NexaDevBot {
  constructor(env = {}) {
    this.env = env;
    this.telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN || '');
    this.github = new GitHubService(env.GITHUB_TOKEN || '', env.GITHUB_OWNER || 'davoodmehraban89');
    this.menu = new MenuManager(this.github);
    this.replayStore = new DurableApprovalReplayStore({
      namespace: env.APPROVAL_REPLAY_GUARD
    });
    this.approvals = new ApprovalService({
      secret: env.APPROVAL_SIGNING_SECRET || env.TELEGRAM_WEBHOOK_SECRET || '',
      replayStore: this.replayStore
    });

    this.githubPlugin = createGitHubPlugin({
      github: this.github,
      menu: this.menu
    });
    this.registry = new PluginRegistry([this.githubPlugin]);
    this.policy = new ActionPolicy();
    this.audit = new AuditLogger({
      secrets: [
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_WEBHOOK_SECRET,
        env.GITHUB_TOKEN,
        env.APPROVAL_SIGNING_SECRET
      ]
    });
    this.router = new PluginRouter({
      registry: this.registry,
      policy: this.policy,
      audit: this.audit
    });
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
    try {
      await this.telegram.answerCallbackQuery(callbackId);
    } catch {
      callbackAnswered = false;
    }

    if (!chatId || !messageId) {
      return { ok: false, error: 'Missing message context for callback', callbackAnswered };
    }

    try {
      if (data.startsWith('approve:')) {
        if (ownerId === undefined || ownerId === null) throw new Error('Approval owner is required');
        const token = data.slice('approve:'.length);
        let payload;
        try {
          payload = await this.approvals.consume(token, {
            ownerId: String(ownerId),
            pluginId: 'github',
            risk: 'WRITE'
          });
        } catch (error) {
          this.audit.log({
            event: 'approval_rejected',
            pluginId: 'github',
            risk: 'WRITE',
            outcome: 'rejected',
            error: error?.message || 'Approval rejected'
          });
          const view = approvalRejectedView(message, error);
          const res = await this.telegram.editMessageText(
            chatId,
            messageId,
            view.text,
            view.reply_markup
          );
          return {
            ok: false,
            approvalRejected: true,
            error: error?.message || 'Approval rejected',
            callbackAnswered,
            edited: true,
            res
          };
        }

        this.audit.log({
          event: 'approval_verified',
          pluginId: payload.pluginId,
          actionId: payload.actionId,
          risk: payload.risk,
          outcome: 'verified'
        });

        const sourceCallback = approvalSourceCallback(payload);
        let routed;
        try {
          routed = await this.router.dispatchCallback(sourceCallback, {
            isOwner: true,
            approved: true
          });
          if (!routed || routed.requiresApproval || routed.denied) {
            throw new Error('Approved action could not be dispatched');
          }
        } catch (error) {
          const view = approvedActionFailedView(payload, error);
          const res = await this.telegram.editMessageText(
            chatId,
            messageId,
            view.text,
            view.reply_markup
          );
          return {
            ok: false,
            approved: true,
            providerError: true,
            actionId: payload.actionId,
            error: error?.message || 'GitHub operation failed',
            callbackAnswered,
            edited: true,
            res
          };
        }

        const res = await this.telegram.editMessageText(
          chatId,
          messageId,
          routed.text,
          routed.reply_markup
        );
        return {
          ok: true,
          approved: true,
          actionId: payload.actionId,
          callbackAnswered,
          edited: true,
          res
        };
      }

      const routed = await this.router.dispatchCallback(data, { isOwner: true });
      if (routed?.requiresApproval) {
        const approval = routed.approval;
        const repoId = approval?.input?.repoId;
        const runId = approval?.input?.runId;
        if (!approval || !Number.isSafeInteger(Number(repoId)) || !Number.isSafeInteger(Number(runId))) {
          throw new Error('Approval metadata is missing');
        }
        if (ownerId === undefined || ownerId === null) throw new Error('Approval owner is required');
        if (!this.approvals.isReplayProtected()) {
          throw new Error('Durable approval replay protection is not configured');
        }

        const token = await this.approvals.issue({
          pluginId: routed.pluginId,
          actionId: routed.actionId,
          risk: routed.risk,
          ownerId: String(ownerId),
          input: approval.input
        });
        this.audit.log({
          event: 'approval_issued',
          pluginId: routed.pluginId,
          actionId: routed.actionId,
          risk: routed.risk,
          outcome: 'pending'
        });

        const view = approvalView({
          label: approval.label || routed.actionId,
          token,
          repoId,
          runId
        });
        const res = await this.telegram.editMessageText(
          chatId,
          messageId,
          view.text,
          view.reply_markup
        );
        return {
          ok: true,
          approvalRequired: true,
          actionId: routed.actionId,
          risk: routed.risk,
          callbackAnswered,
          edited: true,
          res
        };
      }
      if (routed?.denied) {
        return {
          ok: false,
          denied: true,
          actionId: routed.actionId,
          reason: routed.reason,
          callbackAnswered
        };
      }

      const view = routed || await this.menu.renderByCallback(data);
      const res = await this.telegram.editMessageText(
        chatId,
        messageId,
        view.text,
        view.reply_markup
      );

      return { ok: true, edited: true, callbackAnswered, res };
    } catch (err) {
      if (err.message && err.message.includes('message is not modified')) {
        return { ok: true, unmodified: true, callbackAnswered };
      }

      if (!data.startsWith('approve:')) {
        try {
          const view = callbackReadFailedView(data, err);
          const res = await this.telegram.editMessageText(
            chatId,
            messageId,
            view.text,
            view.reply_markup
          );
          return {
            ok: false,
            error: err.message,
            providerError: true,
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
    const text = (message.text || '').trim();

    if (!chatId) return { ok: false, error: 'Missing chat_id' };

    if (text === '/start' || text === '/menu' || text.startsWith('/start')) {
      const view = this.menu.getMainMenuView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, command: 'start', res };
    }

    if (text === '/repos') {
      const routed = await this.router.dispatchCommand(text, { isOwner: true });
      if (routed?.requiresApproval || routed?.denied || !routed) {
        return {
          ok: false,
          command: 'repos',
          error: routed?.reason || 'GitHub repository route unavailable'
        };
      }

      const res = await this.telegram.sendMessage(chatId, routed.text, routed.reply_markup);
      return { ok: true, command: 'repos', res };
    }

    if (text === '/status') {
      const view = this.menu.getServiceStatusView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, command: 'status', res };
    }

    const defaultText = `💡 برای دسترسی به منوهای پروژه‌ها و ابزارهای Nexa Dev، دکمه زیر را لمس کنید:`;
    const view = {
      text: defaultText,
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚡ باز کردن منوی اصلی Nexa Dev', callback_data: 'menu:main' }]
        ]
      }
    };
    const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
    return { ok: true, default: true, res };
  }
}
