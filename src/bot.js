import { TelegramClient } from './telegram.js';
import { GitHubService } from './github.js';
import { MenuManager } from './menu.js';
import { PluginRegistry } from './core/plugin-registry.js';
import { ActionPolicy } from './core/action-policy.js';
import { ApprovalService } from './core/approval.js';
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

export class NexaDevBot {
  constructor(env = {}) {
    this.env = env;
    this.telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN || '');
    this.github = new GitHubService(env.GITHUB_TOKEN || '', env.GITHUB_OWNER || 'davoodmehraban89');
    this.menu = new MenuManager(this.github);
    this.approvals = new ApprovalService({
      secret: env.APPROVAL_SIGNING_SECRET || env.TELEGRAM_WEBHOOK_SECRET || ''
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

  /**
   * Process incoming Telegram webhook update.
   * Owner authorization is enforced at the Worker boundary before this bot is
   * constructed, so routed actions use an owner-authorized internal context.
   */
  async handleUpdate(update) {
    if (!update) return { ok: false, error: 'Empty update' };

    // 1. Handle Inline Keyboard Callback Queries (In-Place Message Editing)
    if (update.callback_query) {
      return this.handleCallbackQuery(update.callback_query);
    }

    // 2. Handle Text Messages and Commands
    if (update.message) {
      return this.handleMessage(update.message);
    }

    return { ok: true, ignored: true };
  }

  async handleCallbackQuery(query) {
    const callbackId = query.id;
    const data = query.data || 'menu:main';
    const message = query.message;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;
    const ownerId = query.from?.id;

    // Callback acknowledgement is best-effort. A stale/expired callback must not
    // block rendering and editing the existing menu message.
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
        if (ownerId === undefined || ownerId === null) {
          throw new Error('Approval owner is required');
        }
        const token = data.slice('approve:'.length);
        const payload = await this.approvals.consume(token, {
          ownerId: String(ownerId),
          pluginId: 'github',
          risk: 'WRITE'
        });
        const sourceCallback = approvalSourceCallback(payload);
        const routed = await this.router.dispatchCallback(sourceCallback, {
          isOwner: true,
          approved: true
        });
        if (!routed || routed.requiresApproval || routed.denied) {
          throw new Error('Approved action could not be dispatched');
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

      // GitHub callbacks pass through the plugin policy boundary. Non-GitHub
      // callbacks remain on the existing compatibility router in Foundation v1.
      const routed = await this.router.dispatchCallback(data, { isOwner: true });
      if (routed?.requiresApproval) {
        const approval = routed.approval;
        const repoId = approval?.input?.repoId;
        const runId = approval?.input?.runId;
        if (!approval || !Number.isSafeInteger(Number(repoId)) || !Number.isSafeInteger(Number(runId))) {
          throw new Error('Approval metadata is missing');
        }
        if (ownerId === undefined || ownerId === null) {
          throw new Error('Approval owner is required');
        }

        const token = await this.approvals.issue({
          pluginId: routed.pluginId,
          actionId: routed.actionId,
          risk: routed.risk,
          ownerId: String(ownerId),
          input: approval.input
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

      // Edit the existing message in-place to prevent chat flooding
      const res = await this.telegram.editMessageText(
        chatId,
        messageId,
        view.text,
        view.reply_markup
      );

      return { ok: true, edited: true, callbackAnswered, res };
    } catch (err) {
      // Ignore 'message is not modified' error in Telegram
      if (err.message && err.message.includes('message is not modified')) {
        return { ok: true, unmodified: true, callbackAnswered };
      }
      return { ok: false, error: err.message, callbackAnswered };
    }
  }

  async handleMessage(message) {
    const chatId = message.chat?.id;
    const text = (message.text || '').trim();

    if (!chatId) return { ok: false, error: 'Missing chat_id' };

    // Command: /start or /menu
    if (text === '/start' || text === '/menu' || text.startsWith('/start')) {
      const view = this.menu.getMainMenuView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, command: 'start', res };
    }

    // GitHub shortcut command routed through the plugin kernel.
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

    // Command: /status
    if (text === '/status') {
      const view = this.menu.getServiceStatusView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, command: 'status', res };
    }

    // Default response: Offer interactive menu
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
