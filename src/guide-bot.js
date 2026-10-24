import { NexaDevBot } from './bot.js';
import { CloudflareMenuManager } from './cloudflare-menu.js';
import { RuntimeDiagnostics } from './core/runtime-diagnostics.js';
import { platformHomeView, platformCapabilityView } from './platform-menu.js';

function guidedPersistentQuickMenuMarkup() {
  return {
    keyboard: [
      [{ text: '🏠 منوی اصلی' }, { text: '📁 پروژه‌ها' }],
      [{ text: '📊 وضعیت' }, { text: '🔧 ابزارها' }],
      [{ text: '🧭 پلتفرم' }, { text: '🔐 امنیت' }],
      [{ text: '📘 راهنما' }]
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
    const chatId = message?.chat?.id,
      rawText = typeof message?.text === 'string' ? message.text : '',
      text = rawText.trim();
    if (!chatId) return super.handleMessage(message);
    if (text === '/start' || text === '/menu' || text.startsWith('/start')) {
      const quickMenuRes = await this.telegram.sendMessage(
        chatId,
        '⌨️ <b>منوی سریع Nexa Dev فعال شد</b>\nاین منو پایین صفحه می‌ماند و «📘 راهنما» از هر بخش در دسترس است.',
        guidedPersistentQuickMenuMarkup()
      );
      const view = this.menu.getMainMenuView();
      const res = await this.telegram.sendMessage(
        chatId,
        view.text,
        view.reply_markup
      );
      return {
        ok: true,
        command: 'start',
        persistentMenu: true,
        quickMenuRes,
        res
      };
    }
    if (text === '📘 راهنما' || text === '/help') {
      const view = this.menu.getGuideIndexView();
      const res = await this.telegram.sendMessage(
        chatId,
        view.text,
        view.reply_markup
      );
      return { ok: true, quickMenu: 'help', res };
    }
    if (text === '🧭 پلتفرم' || text === '/platform') {
      const view = platformHomeView();
      const res = await this.telegram.sendMessage(
        chatId,
        view.text,
        view.reply_markup
      );
      return { ok: true, quickMenu: 'platform', res };
    }
    return super.handleMessage(message);
  }
  async handleCallbackQuery(query) {
    const data = query?.data || '';
    if (data === 'menu:platform' || data.startsWith('platform:')) {
      const view =
        data === 'menu:platform'
          ? platformHomeView()
          : platformCapabilityView(data.slice(9));
      if (!view) return super.handleCallbackQuery(query);
      let callbackAnswered = true;
      try {
        await this.telegram.answerCallbackQuery(query.id);
      } catch {
        callbackAnswered = false;
      }
      const res = await this.telegram.editMessageText(
        query?.message?.chat?.id,
        query?.message?.message_id,
        view.text,
        view.reply_markup
      );
      return { ok: true, platform: true, callbackAnswered, edited: true, res };
    }
    return super.handleCallbackQuery(query);
  }
}
