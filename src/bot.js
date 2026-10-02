import { TelegramClient } from './telegram.js';
import { GitHubService } from './github.js';
import { MenuManager } from './menu.js';

export class NexaDevBot {
  constructor(env = {}) {
    this.env = env;
    this.telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN || '');
    this.github = new GitHubService(env.GITHUB_TOKEN || '', env.GITHUB_OWNER || 'davoodmehraban89');
    this.menu = new MenuManager(this.github);
  }

  /**
   * Process incoming Telegram webhook update
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
      // Render requested view
      const view = await this.menu.renderByCallback(data);

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

    // Legacy or shortcut command: /repos
    if (text === '/repos') {
      const view = await this.menu.getReposListView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
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
