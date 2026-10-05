import { GuidedNexaDevBot } from './guide-bot.js';
import { DurableKillSwitchStoreClient } from './core/kill-switch-store.js';
import { KillSwitch } from './core/kill-switch.js';

const lockMarkup = mode => ({ inline_keyboard: [[
  mode === 'LOCKED'
    ? { text: '🔓 بازکردن اضطراری', callback_data: 'killswitch:unlock' }
    : { text: '🔒 قفل اضطراری', callback_data: 'killswitch:lock' }
]] });

export class KillSwitchGuidedNexaDevBot extends GuidedNexaDevBot {
  constructor(env = {}) {
    super(env);
    const store = new DurableKillSwitchStoreClient({ namespace: env.KILL_SWITCH_STORE });
    this.killSwitch = new KillSwitch({ store });
    if (store.isConfigured()) this.router.killSwitch = this.killSwitch;
  }

  async handleMessage(message) {
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (text === '/killswitch' || text === '/lockdown') {
      const state = await this.killSwitch.status();
      const locked = state.mode === 'LOCKED';
      const res = await this.telegram.sendMessage(message.chat.id,
        locked ? '🔒 <b>قفل اضطراری فعال است</b>\nWRITE، DESTRUCTIVE و ادامه Automation متوقف هستند؛ READ مجاز است.' : '🔓 <b>وضعیت عادی</b>\nقفل اضطراری غیرفعال است.',
        lockMarkup(state.mode));
      return { ok: true, killSwitch: true, mode: state.mode, res };
    }
    return super.handleMessage(message);
  }

  async handleCallbackQuery(query) {
    const data = query?.data || '';
    if (data !== 'killswitch:lock' && data !== 'killswitch:unlock' && data !== 'killswitch:confirm-lock' && data !== 'killswitch:confirm-unlock') return super.handleCallbackQuery(query);
    const chatId = query?.message?.chat?.id;
    const messageId = query?.message?.message_id;
    try { await this.telegram.answerCallbackQuery(query.id); } catch {}
    if (data === 'killswitch:lock' || data === 'killswitch:unlock') {
      const target = data.endsWith('lock') ? 'lock' : 'unlock';
      const label = target === 'lock' ? 'فعال‌کردن قفل اضطراری' : 'بازکردن قفل اضطراری';
      const res = await this.telegram.editMessageText(chatId, messageId,
        `⚠️ <b>${label}</b>\nاین تغییر فقط با تأیید صریح مالک اجرا می‌شود.`,
        { inline_keyboard: [[{ text: '✅ تأیید', callback_data: `killswitch:confirm-${target}` }],[{ text: '↩️ انصراف', callback_data: 'menu:main' }]] });
      return { ok: true, killSwitchApprovalRequired: true, res };
    }
    const target = data.endsWith('lock') ? 'lock' : 'unlock';
    const context = { isOwner: true, approved: true };
    const state = target === 'lock' ? await this.killSwitch.lock(context) : await this.killSwitch.unlock(context);
    this.audit.log({ event: 'kill_switch_control', outcome: 'success', mode: state.mode });
    const res = await this.telegram.editMessageText(chatId, messageId,
      state.mode === 'LOCKED' ? '🔒 <b>قفل اضطراری فعال شد</b>\nWRITE، DESTRUCTIVE و Automation متوقف شدند.' : '🔓 <b>قفل اضطراری باز شد</b>\nاجرای عملیات طبق Policy عادی ادامه دارد.',
      lockMarkup(state.mode));
    return { ok: true, killSwitch: true, mode: state.mode, res };
  }
}
