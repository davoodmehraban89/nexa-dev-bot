import { NexaDevBot } from './bot.js';
import { CloudflareMenuManager } from './cloudflare-menu.js';
import { RuntimeDiagnostics } from './core/runtime-diagnostics.js';

function guidedPersistentQuickMenuMarkup() {
  return {
    keyboard: [
      [{ text: '🏠 منوی اصلی' }, { text: '📁 پروژه‌ها' }],
      [{ text: '📊 وضعیت' }, { text: '🔧 ابزارها' }],
      [{ text: '🔐 امنیت' }, { text: '📘 راهنما' }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Nexa Dev — یک گزینه را انتخاب کنید'
  };
}

export class GuidedNexaDevBot extends NexaDevBot {
  constructor(env = {}) {
    super(env);
    this.diagnostics = new RuntimeDiagnostics({
      env,
      github: this.github,
      registry: this.registry,
      replayStore: this.replayStore,
      workspaceStore: this.workspaceStore,
      approvals: this.approvals
    });
    this.menu = new CloudflareMenuManager(this.github, this.diagnostics);
  }

  async handleMessage(message) {
    const chatId = message?.chat?.id;
    const rawText = typeof message?.text === 'string' ? message.text : '';
    const text = rawText.trim();

    if (!chatId) return super.handleMessage(message);

    if (text === '/start' || text === '/menu' || text.startsWith('/start')) {
      const quickMenuRes = await this.telegram.sendMessage(
        chatId,
        '⌨️ <b>منوی سریع Nexa Dev فعال شد</b>\nاین منو پایین صفحه می‌ماند و «📘 راهنما» از هر بخش در دسترس است.',
        guidedPersistentQuickMenuMarkup()
      );
      const view = this.menu.getMainMenuView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, command: 'start', persistentMenu: true, quickMenuRes, res };
    }

    if (text === '📘 راهنما' || text === '/help') {
      const view = this.menu.getGuideIndexView();
      const res = await this.telegram.sendMessage(chatId, view.text, view.reply_markup);
      return { ok: true, quickMenu: 'help', res };
    }

    return super.handleMessage(message);
  }
}
