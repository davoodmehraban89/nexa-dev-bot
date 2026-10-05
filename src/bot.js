import { NexaDevBot as LegacyNexaDevBot } from './bot-legacy.js';
import { TotpVerifier } from './core/totp.js';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

function destructiveSourceCallback(payload = {}) {
  if (payload.actionId === 'cloudflare.worker.deploy_version') {
    const versionId = String(payload.input?.versionId || '');
    if (!versionId) throw new Error('Destructive approval target is invalid');
    return `cfdeploy:${versionId}`;
  }
  if (payload.actionId === 'github.pull_request.merge') {
    const repoId = Number(payload.input?.repoId);
    const prNumber = Number(payload.input?.prNumber);
    const headSha = String(payload.input?.headSha || '');
    if (!Number.isSafeInteger(repoId) || !Number.isSafeInteger(prNumber) || !/^[a-f0-9]{40}$/i.test(headSha)) {
      throw new Error('Destructive approval target is invalid');
    }
    return `mergepr:${repoId.toString(36)}:${prNumber.toString(36)}:${headSha}`;
  }
  throw new Error('Destructive approval action is not supported');
}

function secondFactorFailureMarkup(payload = {}) {
  if (payload.actionId === 'cloudflare.worker.deploy_version') {
    return { inline_keyboard: [[{ text: '↩️ نسخه‌ها', callback_data: 'cf:versions' }]] };
  }
  return { inline_keyboard: [[{ text: '↩️ پروژه‌ها', callback_data: 'menu:repos' }]] };
}

export class NexaDevBot extends LegacyNexaDevBot {
  constructor(env = {}) {
    super(env);
    this.destructiveTotp = new TotpVerifier({ secret: env.DESTRUCTIVE_TOTP_SECRET || '' });
  }

  async handleCallbackQuery(query) {
    const data = query?.data || 'menu:main';
    const ownerId = query?.from?.id;
    const chatId = query?.message?.chat?.id;
    const messageId = query?.message?.message_id;

    if (data.startsWith('approve:') && ownerId !== undefined && ownerId !== null) {
      const token = data.slice(8);
      let preview = null;
      try { preview = await this.approvals.verify(token, { ownerId: String(ownerId) }); } catch {}

      if (preview?.risk === 'DESTRUCTIVE') {
        let callbackAnswered = true;
        try { await this.telegram.answerCallbackQuery(query.id); } catch { callbackAnswered = false; }

        if (!this.destructiveTotp.isConfigured()) {
          const error = 'Destructive second factor (TOTP) is not configured';
          this.audit.log({ event: 'second_factor_unavailable', pluginId: preview.pluginId, actionId: preview.actionId, risk: 'DESTRUCTIVE', outcome: 'rejected' });
          const res = await this.telegram.editMessageText(
            chatId,
            messageId,
            `⚠️ <b>عملیات متوقف شد</b>\nعامل دوم TOTP برای عملیات DESTRUCTIVE پیکربندی نشده است.\nهیچ تغییری اجرا نشد.`,
            secondFactorFailureMarkup(preview)
          );
          return { ok: false, secondFactorRequired: true, approvalRejected: true, error, callbackAnswered, edited: true, res };
        }

        try {
          await this.replayStore.setSecondFactorPending({
            ownerId: String(ownerId),
            token,
            expiresAt: preview.expiresAt,
            attempts: 0
          });
          this.audit.log({ event: 'second_factor_required', pluginId: preview.pluginId, actionId: preview.actionId, risk: 'DESTRUCTIVE', outcome: 'pending' });
          const res = await this.telegram.editMessageText(
            chatId,
            messageId,
            '🔐 <b>عامل دوم لازم است</b>\nApproval تلگرام معتبر است، اما عملیات هنوز اجرا نشده.\n\nکد ۶ رقمی برنامه Authenticator را به شکل زیر ارسال کنید:\n<code>/totp 123456</code>\n\nکد یا Secret در Audit ذخیره نمی‌شود.',
            secondFactorFailureMarkup(preview)
          );
          return { ok: true, secondFactorRequired: true, actionId: preview.actionId, risk: preview.risk, callbackAnswered, edited: true, res };
        } catch (error) {
          const res = await this.telegram.editMessageText(
            chatId,
            messageId,
            `⚠️ <b>عامل دوم آماده نشد</b>\nهیچ تغییر DESTRUCTIVE اجرا نشد.\n\n${escapeHtml(error?.message || 'Second factor unavailable')}`,
            secondFactorFailureMarkup(preview)
          );
          return { ok: false, secondFactorRequired: true, approvalRejected: true, error: error?.message, callbackAnswered, edited: true, res };
        }
      }
    }

    if (data.startsWith('cfdeploy:')) {
      let callbackAnswered = true; try { await this.telegram.answerCallbackQuery(query.id); } catch { callbackAnswered = false; }
      try {
        const routed = await this.router.dispatchCallback(data, { isOwner: true, ownerId: String(ownerId ?? '') });
        if (!routed?.requiresApproval || routed.actionId !== 'cloudflare.worker.deploy_version') throw new Error(routed?.reason || 'Cloudflare approval route unavailable');
        if (ownerId === undefined || ownerId === null) throw new Error('Approval owner is required');
        const token = await this.approvals.issue({ pluginId: routed.pluginId, actionId: routed.actionId, risk: routed.risk, ownerId: String(ownerId), input: routed.approval.input });
        const callback = `approve:${token}`; if (callback.length > 64) throw new Error('Approval callback exceeds Telegram limit');
        const text = `⚠️ <b>تأیید نهایی Cloudflare لازم است</b>\nVersion: <code>${routed.approval.input.versionId}</code>\n\nTraffic این Worker روی نسخه انتخاب‌شده قرار می‌گیرد. پس از این تأیید، عامل دوم TOTP نیز لازم است.`;
        const markup = { inline_keyboard: [[{ text: '✅ ادامه تأیید Deploy / Rollback', callback_data: callback }],[{ text: '↩️ انصراف', callback_data: 'cf:versions' }]] };
        const res = await this.telegram.editMessageText(chatId, messageId, text, markup);
        return { ok: true, approvalRequired: true, actionId: routed.actionId, risk: routed.risk, callbackAnswered, edited: true, res };
      } catch (error) {
        const text = `⚠️ <b>Cloudflare Deploy آماده نشد</b>\n${escapeHtml(error?.message || 'Unavailable')}`;
        const res = await this.telegram.editMessageText(chatId, messageId, text, { inline_keyboard: [[{ text: '↩️ نسخه‌ها', callback_data: 'cf:versions' }]] });
        return { ok: false, error: error?.message, callbackAnswered, edited: true, res };
      }
    }

    if (data.startsWith('mergepr:')) {
      let callbackAnswered = true; try { await this.telegram.answerCallbackQuery(query.id); } catch { callbackAnswered = false; }
      try {
        const routed = await this.router.dispatchCallback(data, { isOwner: true, ownerId: String(ownerId ?? '') });
        if (!routed?.requiresApproval || routed.actionId !== 'github.pull_request.merge') throw new Error(routed?.reason || 'Merge approval route unavailable');
        if (ownerId === undefined || ownerId === null) throw new Error('Approval owner is required');
        const token = await this.approvals.issue({ pluginId: routed.pluginId, actionId: routed.actionId, risk: routed.risk, ownerId: String(ownerId), input: routed.approval.input });
        const callback = `approve:${token}`; if (callback.length > 64) throw new Error('Approval callback exceeds Telegram limit');
        const text = `⚠️ <b>تأیید نهایی Merge لازم است</b>\nPR #${routed.approval.input.prNumber}\nHead: <code>${routed.approval.input.headSha.slice(0,12)}</code>\n\nMerge فقط برای همین Head و فقط یک‌بار قابل اجراست. پس از این تأیید، عامل دوم TOTP نیز لازم است.`;
        const markup = { inline_keyboard: [[{ text: '✅ ادامه تأیید Merge', callback_data: callback }],[{ text: '↩️ انصراف', callback_data: routed.approval.cancelCallback }]] };
        const res = await this.telegram.editMessageText(chatId, messageId, text, markup);
        return { ok: true, approvalRequired: true, actionId: routed.actionId, risk: routed.risk, callbackAnswered, edited: true, res };
      } catch (error) {
        const text = `⚠️ <b>Merge آماده نشد</b>\n${escapeHtml(error?.message || 'Merge unavailable')}`;
        const res = await this.telegram.editMessageText(chatId, messageId, text, { inline_keyboard: [[{ text: '↩️ پروژه‌ها', callback_data: 'menu:repos' }]] });
        return { ok: false, error: error?.message, callbackAnswered, edited: true, res };
      }
    }

    return super.handleCallbackQuery(query);
  }

  async handleMessage(message) {
    const rawText = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!rawText.startsWith('/totp')) return super.handleMessage(message);

    const chatId = message?.chat?.id;
    const ownerId = message?.from?.id;
    if (!chatId || ownerId === undefined || ownerId === null) {
      return { ok: false, secondFactorRejected: true, error: 'Second-factor owner context is missing' };
    }

    if (!this.destructiveTotp.isConfigured()) {
      const error = 'Destructive second factor (TOTP) is not configured';
      const res = await this.telegram.sendMessage(chatId, '⚠️ <b>عامل دوم پیکربندی نشده است</b>\nهیچ عملیات DESTRUCTIVE اجرا نشد.');
      return { ok: false, secondFactorRejected: true, error, res };
    }

    const match = rawText.match(/^\/totp\s+(\d{6})$/);
    if (!match) {
      const res = await this.telegram.sendMessage(chatId, '⚠️ فرمت کد درست نیست. فقط به شکل <code>/totp 123456</code> ارسال کنید.');
      return { ok: false, secondFactorRejected: true, error: 'Invalid TOTP format', res };
    }

    let pending;
    try {
      pending = await this.replayStore.getSecondFactorPending({ ownerId: String(ownerId) });
    } catch (error) {
      const res = await this.telegram.sendMessage(chatId, '⚠️ وضعیت عامل دوم در دسترس نیست؛ عملیات متوقف شد.');
      return { ok: false, secondFactorRejected: true, error: error?.message || 'Second-factor state unavailable', res };
    }

    if (!pending) {
      const res = await this.telegram.sendMessage(chatId, '⚠️ درخواست DESTRUCTIVE منتظر عامل دوم پیدا نشد. از ابتدا یک Approval تازه ایجاد کنید.');
      return { ok: false, secondFactorRejected: true, error: 'Second-factor challenge is unavailable', res };
    }

    const validCode = await this.destructiveTotp.verify(match[1]);
    if (!validCode) {
      const attempts = Number(pending.attempts || 0) + 1;
      if (attempts >= 5) {
        await this.replayStore.clearSecondFactorPending({ ownerId: String(ownerId) });
      } else {
        await this.replayStore.setSecondFactorPending({ ownerId: String(ownerId), token: pending.token, expiresAt: pending.expiresAt, attempts });
      }
      this.audit.log({ event: 'second_factor_rejected', risk: 'DESTRUCTIVE', outcome: 'rejected', reason: attempts >= 5 ? 'attempt_limit' : 'invalid_code' });
      const res = await this.telegram.sendMessage(
        chatId,
        attempts >= 5
          ? '⚠️ <b>عامل دوم رد شد</b>\nتعداد تلاش مجاز تمام شد. برای ادامه Approval تازه بسازید.'
          : '⚠️ <b>کد TOTP معتبر نیست</b>\nهیچ تغییری اجرا نشد.'
      );
      return { ok: false, secondFactorRejected: true, error: 'Invalid TOTP code', res };
    }

    let payload;
    try {
      const preview = await this.approvals.verify(pending.token, { ownerId: String(ownerId), risk: 'DESTRUCTIVE' });
      payload = await this.approvals.consume(pending.token, {
        ownerId: String(ownerId),
        pluginId: preview.pluginId,
        actionId: preview.actionId,
        risk: 'DESTRUCTIVE'
      });
      await this.replayStore.clearSecondFactorPending({ ownerId: String(ownerId) });
      this.audit.log({ event: 'second_factor_verified', pluginId: payload.pluginId, actionId: payload.actionId, risk: 'DESTRUCTIVE', outcome: 'verified' });

      const routed = await this.router.dispatchCallback(destructiveSourceCallback(payload), {
        isOwner: true,
        ownerId: String(ownerId),
        approved: true
      });
      if (!routed || routed.requiresApproval || routed.denied) throw new Error('Approved destructive action could not be dispatched');

      const res = await this.telegram.sendMessage(chatId, routed.text, routed.reply_markup);
      return { ok: true, approved: true, secondFactorVerified: true, actionId: payload.actionId, res };
    } catch (error) {
      try { await this.replayStore.clearSecondFactorPending({ ownerId: String(ownerId) }); } catch {}
      const res = await this.telegram.sendMessage(
        chatId,
        `⚠️ <b>عملیات DESTRUCTIVE اجرا نشد</b>\nهیچ Success ساختگی ثبت نمی‌شود.\n\n${escapeHtml(error?.message || 'Approval rejected')}`,
        secondFactorFailureMarkup(payload || {})
      );
      return { ok: false, secondFactorRejected: true, error: error?.message || 'Destructive approval rejected', res };
    }
  }
}
