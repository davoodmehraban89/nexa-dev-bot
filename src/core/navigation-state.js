export class NavigationState {
  constructor() {
    this.sessions = new Map();
  }

  set(chatId, state = {}) {
    this.sessions.set(String(chatId), {
      ...state,
      updatedAt: Date.now()
    });
    return this.sessions.get(String(chatId));
  }

  get(chatId) {
    return this.sessions.get(String(chatId)) || null;
  }

  merge(chatId, patch = {}) {
    return this.set(chatId, {
      ...(this.get(chatId) || {}),
      ...patch
    });
  }

  clear(chatId) {
    this.sessions.delete(String(chatId));
  }

  recoveryView(chatId) {
    const state = this.get(chatId);
    return {
      state,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 منوی اصلی', callback_data: 'menu:main' }],
          [{ text: '🔄 تلاش مجدد', callback_data: 'navigation:retry' }],
          [{ text: '❌ لغو عملیات', callback_data: 'navigation:cancel' }]
        ]
      }
    };
  }
}
