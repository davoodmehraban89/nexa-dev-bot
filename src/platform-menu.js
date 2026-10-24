import { UX_CAPABILITIES } from './core/platform-experience.js';
const esc = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
export function platformHomeView() {
  const rows = UX_CAPABILITIES.map((c) => [
    { text: `${c.id}. ${c.title}`, callback_data: `platform:${c.key}` }
  ]);
  rows.push([{ text: '🔙 منوی اصلی', callback_data: 'menu:main' }]);
  return {
    text: `🧭 <b>مرکز تجربه و توسعه پلتفرم</b>\n➖➖➖➖➖➖➖➖➖➖\nردیف‌های ۸ تا ۱۲ در یک سطح واحد: کمک توسعه، QA مبتنی بر شواهد، کاتالوگ Plugin، نمای چندپروژه‌ای و Command Center.\n\nهیچ‌یک از این مسیرها Policy مرکزی یا Safe Approval را دور نمی‌زند.`,
    reply_markup: { inline_keyboard: rows }
  };
}
export function platformCapabilityView(key) {
  const c = UX_CAPABILITIES.find((x) => x.key === key);
  if (!c) return null;
  return {
    text: `🧩 <b>${esc(c.title)}</b>\nردیف <b>${c.id}</b> — <code>${esc(c.mode)}</code>\n➖➖➖➖➖➖➖➖➖➖\nاین قابلیت روی مرز Owner-only و Policy مرکزی اجرا می‌شود. دادهٔ ساختگی جایگزین Evidence نمی‌شود و mutation فقط از Actionهای ثبت‌شده و Safe Approval عبور می‌کند.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 مرکز پلتفرم', callback_data: 'menu:platform' }],
        [{ text: '🏠 منوی اصلی', callback_data: 'menu:main' }]
      ]
    }
  };
}
