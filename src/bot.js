import { NexaDevBot as LegacyNexaDevBot } from './bot-legacy.js';

export class NexaDevBot extends LegacyNexaDevBot {
  async handleCallbackQuery(query) {
    const data = query?.data || 'menu:main';
    const ownerId = query?.from?.id;
    const chatId = query?.message?.chat?.id;
    const messageId = query?.message?.message_id;
    if (data.startsWith('approve:') && ownerId !== undefined && ownerId !== null) {
      const token = data.slice(8);
      let preview = null;
      try { preview = await this.approvals.verify(token, { ownerId: String(ownerId), pluginId: 'github' }); } catch {}
      if (preview?.actionId === 'github.pull_request.merge') {
        let callbackAnswered = true; try { await this.telegram.answerCallbackQuery(query.id); } catch { callbackAnswered = false; }
        try {
          const payload = await this.approvals.consume(token, { ownerId: String(ownerId), pluginId: 'github', actionId: 'github.pull_request.merge', risk: 'DESTRUCTIVE' });
          const input = payload.input || {}; const source = `mergepr:${Number(input.repoId).toString(36)}:${Number(input.prNumber).toString(36)}:${input.headSha}`;
          const routed = await this.router.dispatchCallback(source, { isOwner: true, ownerId: String(ownerId), approved: true });
          if (!routed || routed.requiresApproval || routed.denied) throw new Error('Approved merge could not be dispatched');
          const res = await this.telegram.editMessageText(chatId, messageId, routed.text, routed.reply_markup);
          return { ok: true, approved: true, actionId: payload.actionId, callbackAnswered, edited: true, res };
        } catch (error) {
          const text = `⚠️ <b>Merge اجرا نشد</b>\nهیچ Merge تأییدنشده‌ای انجام نشد.\n\n${String(error?.message || 'Approval rejected').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}`;
          const res = await this.telegram.editMessageText(chatId, messageId, text, { inline_keyboard: [[{ text: '↩️ بازگشت', callback_data: 'menu:repos' }]] });
          return { ok: false, approvalRejected: true, error: error?.message, callbackAnswered, edited: true, res };
        }
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
        const text = `⚠️ <b>تأیید نهایی Merge لازم است</b>\nPR #${routed.approval.input.prNumber}\nHead: <code>${routed.approval.input.headSha.slice(0,12)}</code>\n\nMerge فقط برای همین Head و فقط یک‌بار قابل اجراست.`;
        const markup = { inline_keyboard: [[{ text: '✅ تأیید و Merge', callback_data: callback }],[{ text: '↩️ انصراف', callback_data: routed.approval.cancelCallback }]] };
        const res = await this.telegram.editMessageText(chatId, messageId, text, markup);
        return { ok: true, approvalRequired: true, actionId: routed.actionId, risk: routed.risk, callbackAnswered, edited: true, res };
      } catch (error) {
        const text = `⚠️ <b>Merge آماده نشد</b>\n${String(error?.message || 'Merge unavailable').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}`;
        const res = await this.telegram.editMessageText(chatId, messageId, text, { inline_keyboard: [[{ text: '↩️ پروژه‌ها', callback_data: 'menu:repos' }]] });
        return { ok: false, error: error?.message, callbackAnswered, edited: true, res };
      }
    }
    return super.handleCallbackQuery(query);
  }
}
