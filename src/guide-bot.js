import { NexaDevBot } from './bot.js';
import { CloudflareMenuManager } from './cloudflare-menu.js';
import { RuntimeDiagnostics } from './core/runtime-diagnostics.js';
import { platformHomeView, platformCapabilityView } from './platform-menu.js';
import { studioAppUrl } from './config.js';
import { interceptTelegramSecretMessage } from './core/telegram-secret-guard.js';

const STUDIO_URL_ERROR =
  '⚠️ نشانی Nexa Studio پیکربندی نشده است. با مدیر ربات تماس بگیرید.';

function isOwnerPrivateChat(ownerId, from, chat) {
  return (
    Boolean(ownerId) &&
    from?.id !== undefined &&
    from?.id !== null &&
    String(from.id) === String(ownerId) &&
    chat?.type === 'private' &&
    Number.isSafeInteger(chat.id) &&
    chat.id > 0 &&
    String(chat.id) === String(ownerId)
  );
}

function studioEntryView(url) {
  return url
    ? {
        text: 'برای کار با پروژه‌ها، Nexa Studio را با دکمه زیر باز کنید.\nتوکن و متن کد را در چت نفرستید.',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'باز کردن Nexa Studio', web_app: { url } }]
          ]
        }
      }
    : {
        text: STUDIO_URL_ERROR,
        reply_markup: { inline_keyboard: [] }
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
    const intercepted = await interceptTelegramSecretMessage({
      message,
      telegram: this.telegram,
      ownerId: this.env.OWNER_TELEGRAM_ID
    });
    if (intercepted) return intercepted;
    const chatId = message?.chat?.id,
      rawText = typeof message?.text === 'string' ? message.text : '',
      text = rawText.trim();
    const startCommand = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(text);
    const menuCommand = /^\/menu(?:@[A-Za-z0-9_]+)?$/.test(text);
    if (startCommand || menuCommand || text === '🏠 منوی اصلی') {
      if (
        !isOwnerPrivateChat(
          this.env.OWNER_TELEGRAM_ID,
          message?.from,
          message?.chat
        )
      )
        return {
          ok: false,
          studioEntry: true,
          reason: 'owner_private_chat_required'
        };
      const url = studioAppUrl(this.env.STUDIO_URL);
      if (!url) {
        const res = await this.telegram.sendMessage(chatId, STUDIO_URL_ERROR, {
          remove_keyboard: true
        });
        return { ok: false, studioEntry: true, invalidStudioUrl: true, res };
      }
      const welcomeRes = await this.telegram.sendMessage(
        chatId,
        'به Nexa Studio خوش آمدید.',
        { remove_keyboard: true }
      );
      let menuButtonConfigured;
      if (startCommand) {
        menuButtonConfigured = false;
        try {
          await this.telegram.setChatMenuButton(chatId, {
            type: 'web_app',
            text: 'Nexa Studio',
            web_app: { url }
          });
          menuButtonConfigured = true;
        } catch {
          // Telegram menu setup is optional; never expose provider errors.
        }
      }
      const view = studioEntryView(url);
      const res = await this.telegram.sendMessage(
        chatId,
        view.text,
        view.reply_markup
      );
      return {
        ok: true,
        ...(text === '🏠 منوی اصلی'
          ? { quickMenu: 'main' }
          : { command: 'start' }),
        studioEntry: true,
        ...(startCommand ? { menuButtonConfigured } : {}),
        welcomeRes,
        res
      };
    }
    if (!chatId) return super.handleMessage(message);
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
    if (data === 'menu:main') {
      const message = query?.message;
      if (
        !isOwnerPrivateChat(
          this.env.OWNER_TELEGRAM_ID,
          query?.from,
          message?.chat
        ) ||
        !Number.isSafeInteger(message?.message_id)
      )
        return {
          ok: false,
          studioEntry: true,
          reason: 'owner_private_chat_required'
        };
      let callbackAnswered = true;
      try {
        await this.telegram.answerCallbackQuery(query.id);
      } catch {
        callbackAnswered = false;
      }
      const url = studioAppUrl(this.env.STUDIO_URL);
      const view = studioEntryView(url);
      const res = await this.telegram.editMessageText(
        message.chat.id,
        message.message_id,
        view.text,
        view.reply_markup
      );
      return {
        ok: Boolean(url),
        studioEntry: true,
        ...(!url ? { invalidStudioUrl: true } : {}),
        callbackAnswered,
        edited: true,
        res
      };
    }
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
