import { GuidedNexaDevBot } from './guide-bot.js';
import { DurableKillSwitchStoreClient } from './core/kill-switch-store.js';
import { KillSwitch } from './core/kill-switch.js';

const lockMarkup = (mode) => ({
  inline_keyboard:
    mode === 'LOCKED'
      ? [[{ text: '↩️ منوی اصلی', callback_data: 'menu:main' }]]
      : [[{ text: '🔒 قفل اضطراری', callback_data: 'killswitch:lock' }]]
});

export class KillSwitchGuidedNexaDevBot extends GuidedNexaDevBot {
  constructor(env = {}) {
    super(env);
    const store = new DurableKillSwitchStoreClient({
      namespace: env.KILL_SWITCH_STORE
    });
    this.killSwitch = new KillSwitch({ store });
    if (store.isConfigured()) this.router.killSwitch = this.killSwitch;
  }

  async handleMessage(message) {
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (text === '/killswitch' || text === '/lockdown') {
      const state = await this.killSwitch.status();
      const locked = state.mode === 'LOCKED';
      const res = await this.telegram.sendMessage(
        message.chat.id,
        locked
          ? '🔒 <b>قفل اضطراری فعال است</b>\nWRITE، DESTRUCTIVE و ادامه Automation متوقف هستند؛ READ مجاز است.'
          : '🔓 <b>وضعیت عادی</b>\nقفل اضطراری غیرفعال است.',
        lockMarkup(state.mode)
      );
      return { ok: true, killSwitch: true, mode: state.mode, res };
    }
    return super.handleMessage(message);
  }

  async handleCallbackQuery(query) {
    const data = query?.data || '';
    if (
      data !== 'killswitch:lock' &&
      data !== 'killswitch:unlock' &&
      data !== 'killswitch:confirm-lock' &&
      data !== 'killswitch:confirm-unlock'
    )
      return super.handleCallbackQuery(query);
    const chatId = query?.message?.chat?.id;
    const messageId = query?.message?.message_id;
    try {
      await this.telegram.answerCallbackQuery(query.id);
    } catch {}
    // Historical unlock callbacks never verified a signed approval or TOTP.
    // Keep them fail-closed until the complete unlock protocol is implemented.
    if (data === 'killswitch:unlock' || data === 'killswitch:confirm-unlock') {
      this.audit.log({
        event: 'kill_switch_control',
        outcome: 'denied',
        reason: 'unlock_protocol_required'
      });
      const res = await this.telegram.editMessageText(
        chatId,
        messageId,
        '🔒 قفل فعال می‌ماند. بازکردن قفل به Safe Approval معتبر و TOTP نیاز دارد؛ مسیر قدیمی قابل استفاده نیست.',
        lockMarkup('LOCKED')
      );
      return {
        ok: false,
        killSwitch: true,
        reason: 'unlock_protocol_required',
        res
      };
    }
    if (data === 'killswitch:lock' || data === 'killswitch:unlock') {
      const target = 'lock';
      const label =
        target === 'lock' ? 'فعال‌کردن قفل اضطراری' : 'بازکردن قفل اضطراری';
      const res = await this.telegram.editMessageText(
        chatId,
        messageId,
        `⚠️ <b>${label}</b>\nاین تغییر فقط با تأیید صریح مالک اجرا می‌شود.`,
        {
          inline_keyboard: [
            [
              {
                text: '✅ تأیید',
                callback_data: `killswitch:confirm-${target}`
              }
            ],
            [{ text: '↩️ انصراف', callback_data: 'menu:main' }]
          ]
        }
      );
      return { ok: true, killSwitchApprovalRequired: true, res };
    }
    const context = { isOwner: true, approved: true };
    const state = await this.killSwitch.lock(context);
    this.audit.log({
      event: 'kill_switch_control',
      outcome: 'success',
      mode: state.mode
    });
    const res = await this.telegram.editMessageText(
      chatId,
      messageId,
      state.mode === 'LOCKED'
        ? '🔒 <b>قفل اضطراری فعال شد</b>\nWRITE، DESTRUCTIVE و Automation متوقف شدند.'
        : '🔓 <b>قفل اضطراری باز شد</b>\nاجرای عملیات طبق Policy عادی ادامه دارد.',
      lockMarkup(state.mode)
    );
    return { ok: true, killSwitch: true, mode: state.mode, res };
  }
}
