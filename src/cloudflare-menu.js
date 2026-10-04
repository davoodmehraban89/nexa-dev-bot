import { OpsMenuManager } from './ops-menu.js';

export class CloudflareMenuManager extends OpsMenuManager {
  getToolsView() {
    const view = super.getToolsView();
    const rows = [...(view.reply_markup?.inline_keyboard || [])];
    const insertAt = Math.min(2, rows.length);
    rows.splice(insertAt, 0, [{ text: '☁️ Cloudflare status', callback_data: 'cf:status' }]);
    return {
      ...view,
      reply_markup: { ...(view.reply_markup || {}), inline_keyboard: rows }
    };
  }
}
