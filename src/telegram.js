import { WORKSPACE_EDITOR_LIMITS } from './core/workspace-policy.js';

export class TelegramClient {
  constructor(botToken, options = {}) {
    this.botToken = botToken;
    this.baseUrl = options.baseUrl || `https://api.telegram.org/bot${botToken}`;
    this.fileBaseUrl =
      options.fileBaseUrl || `https://api.telegram.org/file/bot${botToken}`;
    this.fetchFn = options.fetch || ((...args) => fetch(...args));
  }

  async callApi(method, payload) {
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    let response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      throw new Error(`Telegram API ${method} network failure: ${err.message}`);
    }

    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const detail = body?.description ? ` ${body.description}` : '';
      throw new Error(
        `Telegram API ${method} failed: ${response.status}${detail}`
      );
    }

    if (!body || body.ok !== true) {
      const detail = body?.description || 'Unknown Telegram API error';
      throw new Error(`Telegram API ${method} failed: ${detail}`);
    }

    return body;
  }

  async downloadTextFile(
    fileId,
    { maxBytes = WORKSPACE_EDITOR_LIMITS.maxBytes } = {}
  ) {
    if (!this.botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    const id = String(fileId || '');
    if (!id) throw new Error('Telegram file_id is required');
    const limit = Number(maxBytes);
    if (!Number.isFinite(limit) || limit <= 0)
      throw new Error('Telegram file size limit is invalid');

    const metadata = await this.callApi('getFile', { file_id: id });
    const filePath = String(metadata?.result?.file_path || '');
    if (!filePath) throw new Error('Telegram getFile did not return file_path');
    const announcedSize = Number(metadata?.result?.file_size);
    if (Number.isFinite(announcedSize) && announcedSize > limit) {
      throw new Error(`Telegram file exceeds ${limit} byte size limit`);
    }

    const safePath = filePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    let response;
    try {
      response = await this.fetchFn(`${this.fileBaseUrl}/${safePath}`, {
        method: 'GET'
      });
    } catch (err) {
      throw new Error(`Telegram file download network failure: ${err.message}`);
    }
    if (!response.ok)
      throw new Error(`Telegram file download failed: ${response.status}`);

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > limit)
      throw new Error(`Telegram file exceeds ${limit} byte size limit`);

    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Telegram file is not valid UTF-8 text');
    }
    return { text, byteLength: bytes.byteLength, filePath };
  }

  async sendMessage(chatId, text, replyMarkup = null, parseMode = 'HTML') {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: parseMode
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    return this.callApi('sendMessage', payload);
  }

  async deleteMessage(chatId, messageId) {
    return this.callApi('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  async setChatMenuButton(chatId, menuButton) {
    return this.callApi('setChatMenuButton', {
      chat_id: chatId,
      menu_button: menuButton
    });
  }

  async editMessageText(
    chatId,
    messageId,
    text,
    replyMarkup = null,
    parseMode = 'HTML'
  ) {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    return this.callApi('editMessageText', payload);
  }

  async answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    const payload = { callback_query_id: callbackQueryId };
    if (text) payload.text = text;
    if (showAlert) payload.show_alert = showAlert;
    return this.callApi('answerCallbackQuery', payload);
  }
}
