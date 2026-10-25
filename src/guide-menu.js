import { MenuManager } from './menu.js';

const GUIDE_TITLES = Object.freeze({
  1: 'شروع، منوهای اصلی و ابزارهای عملیاتی',
  2: 'پروژه، فایل‌ها و مشاهده کد',
  3: 'Workspace و دکمه‌های ویرایش',
  4: 'اصلاح فایل از ابتدا تا Commit',
  5: 'CI / Actions و کنترل اجراها',
  6: 'مرکز امنیت، خطاها و مسیرهای برگشت',
  7: 'Production، Cloudflare و مرزهای عملیاتی'
});

const GUIDE_MAX_PAGE = Object.keys(GUIDE_TITLES).length;

function guideNav(page) {
  const rows = [];
  const step = Number(page);
  const move = [];
  if (step > 1)
    move.push({ text: '⬅️ فصل قبلی', callback_data: `help:${step - 1}` });
  if (step < GUIDE_MAX_PAGE)
    move.push({ text: 'فصل بعدی ➡️', callback_data: `help:${step + 1}` });
  if (move.length) rows.push(move);
  rows.push([
    { text: '📘 فهرست راهنما', callback_data: 'menu:help' },
    { text: '🏠 منوی اصلی', callback_data: 'menu:main' }
  ]);
  return { inline_keyboard: rows };
}

function guidePage(page) {
  const pages = {
    1: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n<b>۱. شروع، منوهای اصلی و ابزارهای عملیاتی</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>🏠 منوی اصلی</b>\nنقطهٔ برگشت امن شماست و همهٔ بخش‌های اصلی را باز می‌کند.\n\n<b>📁 پروژه‌ها / مخزن‌ها</b>\nRepositoryهای قابل‌دسترسی GitHub را زنده می‌خواند و مسیر فایل، PR، Commit، CI، Branch، Issue، Release و Workspace را باز می‌کند.\n\n<b>📊 وضعیت</b>\nوضعیت واقعی Worker، مرز Owner-only، GitHub READ، WORKSPACE_STORE، Replay Guard، Approval signer و Plugin Registry را نشان می‌دهد. latency یا SLA ساختگی گزارش نمی‌شود.\n\n<b>🔧 ابزارها</b>\nکنسول عیب‌یابی فقط‌خواندنی است. «🩺 خودآزمایی» پیش‌نیازها را کنترل می‌کند؛ «🐙 تست اتصال GitHub» یک READ زنده انجام می‌دهد؛ «☁️ Cloudflare status» وضعیت Deployment/Version، Binding metadata و Observability Worker را از API واقعی Cloudflare می‌خواند؛ «🧱 Runtime / Bindings» وضعیت Runtime و Durable Objectها را نشان می‌دهد؛ «🧩 Plugin Registry» Pluginها و Actionها را می‌شمارد؛ Ping فقط مسیر داخلی Bot را تست می‌کند.\n\n<b>⚙️ پیکربندی</b>\nدر V2.1 عمداً فقط‌خواندنی است. Runtime، Providerها، Workspace Editor و Pluginها را بدون نمایش Secret نشان می‌دهد و تنظیم حساس را از Telegram تغییر نمی‌دهد. در «Providerها»، دکمهٔ تست زنده GitHub یک READ واقعی را همان‌جا اجرا می‌کند و مسیر بازگشت به پیکربندی را حفظ می‌کند.\n\n<b>🔐 امنیت</b>\nSecurity Center است؛ Owner-only، Safe Approval، Replay protection و Policy عملیات را توضیح می‌دهد.\n\n<b>📘 راهنما</b>\nهمین راهنما را باز می‌کند و از منوی ثابت پایین Telegram هم در دسترس است.\n\n<b>🔄 بروزرسانی / بررسی مجدد</b>\nدادهٔ همان صفحه را دوباره می‌خواند و به‌تنهایی WRITE انجام نمی‌دهد.\n\n<b>🔙 بازگشت</b>\nبه سطح قبلی ناوبری برمی‌گردد.`,

    2: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n<b>۲. پروژه، فایل‌ها و مشاهده کد</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>نام Repository</b>\nصفحهٔ پروژه را با Metadata زنده GitHub باز می‌کند.\n\n<b>📂 فایل‌ها</b>\nساختار فایل‌ها و پوشه‌ها را باز می‌کند؛ 📁 وارد پوشه و 📄 اطلاعات فایل را باز می‌کند؛ محتوا فقط در Mini App احراز هویت‌شده دیده می‌شود.\n\n<b>✏️ Edit</b>\nبرای فایل متنی مجاز Workspace امن می‌سازد. فایل حساس، باینری، Git LFS یا خارج از Policy قابل Edit نیست.\n\n<b>🔀 Pull Requestها / PR</b>\nPRها و جزئیات آن‌ها را می‌خواند. Files / Diff فقط نام فایل و شمارش تغییرات را در تلگرام نشان می‌دهد؛ متن patch وارد پیام نمی‌شود. Checks نتیجهٔ کنترل‌هاست.\n\n<b>📝 Commitها</b>\nآخرین Commitهای Repository را نمایش می‌دهد. با انتخاب هر مورد، <b>جزئیات Commit</b> شامل SHA، نویسنده، زمان، پیام کامل، تعداد additions/deletions و فایل‌های تغییرکرده مستقیماً از GitHub باز می‌شود.\n\n<b>📊 وضعیت / تست‌ها</b>\nآخرین وضعیت Workflowهای پروژه را خلاصه می‌کند.\n\n<b>🧪 CI / Actions</b>\nWorkflow Runها را باز می‌کند؛ جزئیات در فصل ۵ است.\n\n<b>🌿 Branches</b>\nBranchها و Compare نسبت به شاخهٔ پیش‌فرض را نشان می‌دهد.\n\n<b>🐛 Issues</b>\nIssueهای Repository را صفحه‌بندی می‌کند. با انتخاب هر مورد، <b>جزئیات Issue</b> شامل وضعیت، نویسنده، برچسب‌ها، مسئول‌ها، زمان بروزرسانی و متن Issue از GitHub نمایش داده می‌شود.\n\n<b>🏷 Releases</b>\nReleaseهای GitHub را نمایش می‌دهد. با انتخاب هر Release، <b>Release notes</b>، Tag، Target، نویسنده، زمان انتشار و وضعیت draft/pre-release از منبع GitHub باز می‌شود.\n\n<b>⬅️ جدیدتر / قدیمی‌تر ➡️</b>\nبین صفحات نتایج جابه‌جا می‌شود و WRITE انجام نمی‌دهد.`,

    3: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n<b>۳. Workspace و دکمه‌های ویرایش</b>\n➖➖➖➖➖➖➖➖➖➖\n\nپس از <b>✏️ Edit</b> یک Draft Durable ساخته می‌شود و هنوز GitHub تغییر نکرده است. Workspace در <code>WORKSPACE_STORE</code> نگهداری می‌شود.\n\n<b>📝 Workspace / باز کردن Draft</b>\nوضعیت Draft، Base snapshot و پیام Commit را نشان می‌دهد.\n\n<b>🧑‍💻 Editor</b>\nTelegram Mini App چندخطی را باز می‌کند. «ذخیره Draft» فقط Draft را در WORKSPACE_STORE ذخیره می‌کند و GitHub WRITE ندارد.\n\nمتن منبع و فایل را در چت ارسال نکنید؛ ویرایش Draft فقط در Mini App احراز هویت‌شده انجام می‌شود. دکمه‌های قدیمی ویرایش چت نیز همین Editor را باز می‌کنند. اگر Editor در دسترس نیست، ابتدا پیکربندی Mini App باید اصلاح شود.\n\n<b>✍️ پیام Commit</b>\nپیام Commit بعدی را ثبت می‌کند.\n\n<b>🔍 Diff</b>\nOriginal و Draft را پیش از WRITE مقایسه می‌کند.\n\n<b>✅ آماده Commit</b>\nتغییر، Base و پیام Commit را اعتبارسنجی و Intent امن می‌سازد.\n\n<b>🗑 لغو Draft</b>\nWorkspace جاری را لغو می‌کند و GitHub دست‌نخورده می‌ماند.`,

    4: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n<b>۴. اصلاح فایل از ابتدا تا Commit</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>۱ — پروژه‌ها</b>\nRepository موردنظر را انتخاب کنید.\n\n<b>۲ — فایل‌ها</b>\nفایل متنی را پیدا و باز کنید.\n\n<b>۳ — Edit</b>\nEdit را بزنید؛ Snapshot شاخهٔ پیش‌فرض Pin و Draft ساخته می‌شود.\n\n<b>۴ — Editor</b>\nکد یا متن را اصلاح کنید و «ذخیره Draft» را بزنید. این مرحله هنوز GitHub WRITE نیست.\n\n<b>۵ — Diff</b>\nتغییر را دقیق بررسی کنید؛ اگر اشتباه است به Editor برگردید یا Draft را لغو کنید.\n\n<b>۶ — پیام Commit</b>\nیک پیام روشن ثبت کنید؛ نمونه: <code>docs: clarify bot guide</code>.\n\n<b>۷ — آماده Commit</b>\nIntent نهایی ساخته و مواد Commit قفل می‌شود.\n\n<b>۸ — Safe Approval</b>\nصفحهٔ تأیید باز می‌شود. فقط «✅ تأیید و اجرا» اجازهٔ WRITE نهایی را می‌دهد؛ انصراف هیچ WRITEای انجام نمی‌دهد.\n\n<b>۹ — نتیجه</b>\nBot یک Branch به شکل <code>nexa/edit-*</code> و Commit روی همان Branch می‌سازد. <b>main مستقیماً تغییر نمی‌کند.</b> Merge یا تغییر شاخهٔ پیش‌فرض عملیات جداگانه است.`,

    5: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n<b>۵. CI / Actions و کنترل اجراها</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>🧪 CI / Actions</b>\nWorkflow Runها را از GitHub می‌خواند.\n\n<b>Run</b>\nوضعیت، نتیجه، Branch و Commit اجرای انتخاب‌شده را نشان می‌دهد.\n\n<b>Jobها</b>\nهر Job و Stepهای آن را نمایش می‌دهد.\n\n<b>log</b>\nبخش محدود و امنی از log Job را برای عیب‌یابی نشان می‌دهد.\n\n<b>Artifacts</b>\nMetadata فایل‌های خروجی Workflow را به‌صورت صفحه‌بندی‌شده نمایش می‌دهد.\n\n<b>🔄 بروزرسانی</b>\nوضعیت Run را دوباره از GitHub می‌خواند.\n\n<b>⬅️ جدیدتر / قدیمی‌تر ➡️</b>\nبین صفحات Runها جابه‌جا می‌شود.\n\n<b>اجرای مجدد Jobهای شکست‌خورده</b>\nیک GitHub WRITE است و فقط بعد از Safe Approval اجرا می‌شود.\n\n<b>لغو Workflow</b>\nWRITE است و آن هم نیازمند Safe Approval معتبر و یک‌بارمصرف است.`,

    6: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n<b>۶. مرکز امنیت، خطاها و مسیرهای برگشت</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>🔐 مرکز امنیت</b>\nوضعیت Owner-only، Webhook secret، GitHub credential، Workspace isolation، Approval signer و Replay Guard را بدون نمایش مقدار Secret نشان می‌دهد.\n\n<b>🛡 خودآزمایی امنیت</b>\nکنترل‌های الزامی Runtime را به‌صورت fail-closed بررسی می‌کند؛ اگر Binding یا Credential لازم موجود نباشد موفقیت ساختگی اعلام نمی‌شود.\n\n<b>📜 سیاست عملیات</b>\nREAD فقط برای Owner است. WRITE و DESTRUCTIVE باید از Policy مرکزی عبور کنند و پیش از Provider mutation تأیید معتبر داشته باشند.\n\n<b>✅ Safe Approval</b>\nApproval به Owner، Action، Risk، Target و Expiry متصل است و با Durable Replay Guard یک‌بارمصرف می‌ماند. Approval مصرف‌شده دوباره قابل استفاده نیست.\n\n<b>خطاهای Provider</b>\nاگر GitHub یا سرویس خارجی خطا بدهد Bot باید همان شکست را صریح نشان دهد و Success جعل نکند.\n\n<b>Validation Error</b>\nمواردی مثل نبود پیام Commit یا نبود تغییر واقعی، بدون Provider WRITE اصلاح می‌شوند.\n\n<b>مسیرهای برگشت</b>\nاز خطا یا Workspace می‌توانید به Draft، Project، Files یا منوی اصلی برگردید. Secret، Source، Draft و Signed token نباید در Log یا پیام تشخیصی افشا شوند.`,

    7: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n<b>۷. Production، Cloudflare و مرزهای عملیاتی</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>Production</b>\nنسخهٔ Production روی Cloudflare Worker اجرا می‌شود. Deploy رسمی باید از Commit تأییدشدهٔ <code>main</code> و پس از CI موفق انجام شود.\n\n<b>Cloudflare Deploy</b>\nWorkflow استقرار همان SHA تأییدشده را Deploy می‌کند. شماره یا Version ID ثابت داخل راهنما نگه‌داری نمی‌شود چون در هر Deploy تغییر می‌کند.\n\n<b>Worker Preview</b>\nساخت خودکار شاخهٔ G0 فعلاً فقط بررسی ساخت بدون انتشار است و Preview جدید ایجاد نمی‌کند.\nPreview برای بررسی Branch/PR از Production جداست. Durable Objectهای Preview Binding مستقل دارند تا Draft یا Replay state آزمایشی با Production مخلوط نشود.\n\n<b>Durable Object</b>\n<code>WORKSPACE_STORE</code> Draft و Workspace را نگه می‌دارد؛ <code>APPROVAL_REPLAY_GUARD</code> مصرف یک‌بارهٔ Approval را پایدار می‌کند.\n\n<b>📊 وضعیت داخل Telegram</b>\nداخل Telegram، چون مسیر Owner-only است، جزئیات عملیاتی مانند Bindingها، GitHub READ probe و Cloudflare Worker READ status قابل مشاهده است. Cloudflare status فقط READ است و هیچ Deploy، Rollback یا تنظیمی را تغییر نمی‌دهد.\n\n<b>HTTP /status</b>\nEndpoint عمومی <code>/status</code> عمداً حداقلی است و جزئیات Owner-only، Secret presence یا خطاهای حساس Provider را افشا نمی‌کند.\n\n<b>Observability</b>\nLogging/Observability برای بررسی Runtime استفاده می‌شود؛ موفقیت CI به‌تنهایی معادل سلامت Production نیست و Deploy و Smoke باید جداگانه اعتبارسنجی شوند.`
  };

  return pages[Number(page)] || pages[1];
}

export class GuideMenuManager extends MenuManager {
  getMainMenuView() {
    const view = super.getMainMenuView();
    const rows = view.reply_markup.inline_keyboard.map((row) => [...row]);
    rows.push([{ text: '📘 راهنما', callback_data: 'menu:help' }]);
    return { ...view, reply_markup: { inline_keyboard: rows } };
  }

  getGuideIndexView() {
    const rows = Object.entries(GUIDE_TITLES).map(([page, title]) => [
      {
        text: `${page}️⃣ ${title}`,
        callback_data: `help:${page}`
      }
    ]);
    rows.push([{ text: '🏠 منوی اصلی', callback_data: 'menu:main' }]);
    return {
      text: `📘 <b>راهنمای Nexa Dev — V2.1</b>\n➖➖➖➖➖➖➖➖➖➖\nاین راهنما دکمه‌های فعلی Bot، ابزارهای عملیاتی، مسیر کامل اصلاح فایل و مرز Production را توضیح می‌دهد. یک فصل را انتخاب کنید:`,
      reply_markup: { inline_keyboard: rows }
    };
  }

  getGuidePageView(page) {
    return { text: guidePage(page), reply_markup: guideNav(page) };
  }

  async renderByCallback(callbackData) {
    const value = String(callbackData || '');
    if (value === 'menu:help' || value === 'help:index')
      return this.getGuideIndexView();
    const match = value.match(/^help:([1-7])$/);
    if (match) return this.getGuidePageView(Number(match[1]));
    return super.renderByCallback(callbackData);
  }
}
