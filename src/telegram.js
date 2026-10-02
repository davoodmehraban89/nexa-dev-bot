export class TelegramClient {
  constructor(botToken, options = {}) {
    this.botToken = botToken;
    this.baseUrl = options.baseUrl || `https://api.telegram.org/bot${botToken}`;
    this.fetchFn = options.fetch || fetch;
  }

  async callApi(method, payload) {
    if (!this.botToken) {
      // In mock/test environment without token
      return { ok: true, result: { message_id: 1001, ...payload } };
    }

    try {
      const response = await this.fetchFn(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (err) {
      return { ok: false, description: err.message };
    }
  }

  async sendMessage(chatId, text, replyMarkup = null, parseMode = 'HTML') {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    return this.callApi('sendMessage', payload);
  }

  async editMessageText(chatId, messageId, text, replyMarkup = null, parseMode = 'HTML') {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    return this.callApi('editMessageText', payload);
  }

  async answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    const payload = {
      callback_query_id: callbackQueryId
    };
    if (text) payload.text = text;
    if (showAlert) payload.show_alert = showAlert;
    return this.callApi('answerCallbackQuery', payload);
  }
}
