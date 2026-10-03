export class NavigationRecovery {
  constructor() {
    this.states = new Map();
  }

  save(chatId, state = {}) {
    if (!chatId) return;
    this.states.set(String(chatId), {
      ...state,
      updatedAt: Date.now()
    });
  }

  get(chatId) {
    return this.states.get(String(chatId)) || null;
  }

  clear(chatId) {
    this.states.delete(String(chatId));
  }

  recoveryView(state = {}) {
    const callback = state.repoId ? `repo:${state.repoId}` : 'menu:main';
    return {
      text: '⚠️ خطا رخ داد\n\nوضعیت فعلی شما محفوظ است. یک مسیر ادامه را انتخاب کنید.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 تلاش مجدد', callback_data: state.retryCallback || 'menu:main' }],
          [{ text: '↩️ بازگشت', callback_data: callback }],
          [{ text: '🏠 منوی اصلی', callback_data: 'menu:main' }]
        ]
      }
    };
  }
}
