export class TelegramClient {
  constructor(botToken, options = {}) {
    this.botToken = botToken;
    this.baseUrl = options.baseUrl || `https://api.telegram.org/bot${botToken}`;
    this.fetchFn = options.fetch || fetch;
  }

  async callApi(method, payload) {
    if (!this.botToken) {
      return { ok: true, result: { message_id: 1001, ...payload } };
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
      throw new Error(`Telegram API ${method} failed: ${response.status}${detail}`);
    }

    if (!body || body.ok !== true) {
      const detail = body?.description || 'Unknown Telegram API error';
      throw new Error(`Telegram API ${method} failed: ${detail}`);
    }

    return body;
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

  async editMessageText(chatId, messageId, text, replyMarkup = null, parseMode = 'HTML') {
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
