import { MenuManager } from './menu.js';

const GUIDE_TITLES = Object.freeze({
  1: 'شروع و منوهای اصلی',
  2: 'پروژه، فایل‌ها و مشاهده کد',
  3: 'Workspace و دکمه‌های ویرایش',
  4: 'اصلاح فایل از ابتدا تا Commit',
  5: 'CI / Actions و کنترل اجراها',
  6: 'امنیت، خطاها و مسیرهای برگشت'
});

function guideNav(page) {
  const rows = [];
  const step = Number(page);
  const move = [];
  if (step > 1) move.push({ text: '⬅️ فصل قبلی', callback_data: `help:${step - 1}` });
  if (step < 6) move.push({ text: 'فصل بعدی ➡️', callback_data: `help:${step + 1}` });
  if (move.length) rows.push(move);
  rows.push([
    { text: '📘 فهرست راهنما', callback_data: 'menu:help' },
    { text: '🏠 منوی اصلی', callback_data: 'menu:main' }
  ]);
  return { inline_keyboard: rows };
}

function guidePage(page) {
  const pages = {
    1: `📘 <b>راهنمای Nexa Dev — V2</b>\n<b>۱. شروع و منوهای اصلی</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>🏠 منوی اصلی</b>\nصفحهٔ اصلی Bot را باز می‌کند و از هرجای کار نقطهٔ برگشت امن شماست.\n\n<b>📁 پروژه‌ها / مخزن‌ها</b>\nفهرست Repositoryهای قابل‌دسترسی GitHub را زنده می‌خواند. انتخاب نام هر پروژه، صفحهٔ همان Repository را باز می‌کند.\n\n<b>📊 وضعیت</b>\nوضعیت داخلی Worker، Webhook، اتصال زنده GitHub و مسیر CI/CD را بدون ادعای SLA ساختگی نمایش می‌دهد.\n\n<b>🔧 ابزارها</b>\nابزارهای داخلی توسعه را باز می‌کند. «🏓 بررسی مسیر داخلی» فقط پاسخ‌گویی مسیر داخلی Bot را تست می‌کند و سلامت GitHub یا اینترنت را تضمین نمی‌کند.\n\n<b>⚙️ تنظیمات</b>\nتنظیمات غیرمحرمانه مثل Runtime، مالک پیش‌فرض GitHub، زبان و مدل ناوبری را نشان می‌دهد. Secretها نمایش داده نمی‌شوند.\n\n<b>🔐 امنیت</b>\nقواعد Owner-only، Webhook secret، نگهداری Credentialها و مرزهای امنیتی را توضیح می‌دهد.\n\n<b>📘 راهنما</b>\nهمین راهنمای V2 را باز می‌کند. این دکمه هم در منوی اصلی و هم در منوی ثابت پایین Telegram قرار دارد.\n\n<b>🔄 بروزرسانی / بررسی مجدد</b>\nهمان صفحه را دوباره از منبع مربوطه می‌خواند. در صفحات GitHub باعث refresh دادهٔ خواندنی می‌شود و به‌تنهایی WRITE انجام نمی‌دهد.\n\n<b>🔙 بازگشت</b>\nبه سطح قبلی ناوبری می‌رود؛ متن دکمه مشخص می‌کند برگشت به پروژه، فایل‌ها، Run یا منوی اصلی است.`,

    2: `📘 <b>راهنمای Nexa Dev — V2</b>\n<b>۲. پروژه، فایل‌ها و مشاهده کد</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>دکمهٔ نام هر Repository</b>\nصفحهٔ پروژه را با نام، دسترسی، شاخهٔ پیش‌فرض و اطلاعات زنده GitHub باز می‌کند.\n\n<b>📂 فایل‌ها</b>\nساختار فایل‌ها و پوشه‌ها را باز می‌کند. دکمهٔ 📁 کنار پوشه وارد همان پوشه می‌شود و دکمهٔ 📄 کنار فایل پیش‌نمایش آن فایل را باز می‌کند.\n\n<b>✏️ Edit</b>\nفقط برای فایل متنی مجاز نمایش داده می‌شود و Workspace امن همان فایل را می‌سازد. فایل حساس، باینری، LFS یا بزرگ‌تر از Policy قابل Edit نیست.\n\n<b>🔀 Pull Requestها / 🔎 PRها</b>\nPRها را نمایش می‌دهد. انتخاب شمارهٔ PR جزئیات را باز می‌کند؛ «🧩 فایل‌ها / Diff» فایل‌های تغییرکرده و patch را نشان می‌دهد و «✅ Checks» نتیجه Checkها را می‌خواند.\n\n<b>📝 Commitها</b>\nآخرین Commitهای Repository را برای مشاهده نشان می‌دهد.\n\n<b>📊 وضعیت / تست‌ها</b>\nآخرین وضعیت Workflowهای اصلی مخزن را خلاصه می‌کند.\n\n<b>🧪 CI / Actions</b>\nفهرست Workflow Runها را باز می‌کند؛ جزئیات کامل آن در فصل ۵ آمده است.\n\n<b>🌿 Branches</b>\nBranchها را نشان می‌دهد. دکمهٔ ↔️ کنار هر Branch آن را با شاخهٔ پیش‌فرض Compare می‌کند و Ahead/Behind و فایل‌های تغییرکرده را نمایش می‌دهد.\n\n<b>🐛 Issues</b>\nIssueهای Repository را به‌صورت صفحه‌بندی‌شده می‌خواند.\n\n<b>🏷 Releases</b>\nReleaseهای GitHub را نمایش می‌دهد.\n\n<b>⬅️ جدیدتر / قدیمی‌تر ➡️</b>\nصفحه‌بندی داده‌های GitHub است؛ فقط بین صفحات نتایج جابه‌جا می‌شود.\n\n<b>📦 پروژه / 🔙 پروژه / 🔙 فایل‌ها / 🔙 PR</b>\nمسیر برگشت متناسب با صفحهٔ فعلی را اجرا می‌کند و هیچ تغییری در Repository ایجاد نمی‌کند.`,

    3: `📘 <b>راهنمای Nexa Dev — V2</b>\n<b>۳. Workspace و دکمه‌های ویرایش</b>\n➖➖➖➖➖➖➖➖➖➖\n\nپس از زدن <b>✏️ Edit</b>، Bot یک Draft محلی و Durable می‌سازد. هنوز GitHub تغییر نکرده است.\n\n<b>📝 باز کردن Draft / 📝 Workspace</b>\nبه Workspace همان فایل برمی‌گردد و وضعیت Draft، Base و پیام Commit را نشان می‌دهد.\n\n<b>🧑‍💻 Editor</b>\nMini App ویرایشگر را باز می‌کند. محتوای فایل را در یک باکس واقعی چندخطی می‌بینید و می‌توانید کد یا متن را بدون خراب‌شدن قالب Paste/Edit کنید. دکمهٔ «ذخیره Draft» داخل Editor فقط Draft محلی را ذخیره می‌کند؛ GitHub را تغییر نمی‌دهد.\n\n<b>📎 بارگذاری فایل</b>\nیک فایل متنی UTF-8 را به‌عنوان محتوای جایگزین Draft دریافت می‌کند. نام فایل آپلودشده نام مقصد Repository را عوض نمی‌کند.\n\n<b>📝 Paste متن</b>\nمسیر قدیمی و fallback است و فقط وقتی Editor در دسترس نباشد استفاده می‌شود. مسیر اصلی V2 همان Editor است.\n\n<b>✍️ پیام Commit</b>\nBot منتظر پیام بعدی شما می‌ماند و آن را به‌عنوان Commit Message ذخیره می‌کند. پیام Commit باید کوتاه و معنادار باشد.\n\n<b>🔍 Diff</b>\nتفاوت Original و Draft را قبل از هر WRITE نشان می‌دهد. تعداد خطوط اضافه/حذف و preview تغییرات را بررسی کنید.\n\n<b>✅ آماده Commit</b>\nمواد نهایی Commit را قفل می‌کند و Intent امن می‌سازد. اگر تغییر واقعی یا Commit Message معتبر وجود نداشته باشد، عملیات جلو نمی‌رود.\n\n<b>🗑 لغو Draft</b>\nWorkspace و Draft جاری را لغو می‌کند؛ GitHub دست‌نخورده می‌ماند.\n\n<b>↩️ بازگشت به Draft</b>\nاز ورودی فایل/پیام یا خطا به Workspace قبلی برمی‌گردد.\n\n<b>🔙 فایل‌ها / 📦 پروژه</b>\nاز Workspace به مرور فایل‌ها یا صفحهٔ پروژه برمی‌گردد.`,

    4: `📘 <b>راهنمای Nexa Dev — V2</b>\n<b>۴. اصلاح فایل از ابتدا تا Commit</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>گام ۱ — پروژه</b>\nاز «📁 پروژه‌ها» Repository موردنظر را انتخاب کنید.\n\n<b>گام ۲ — فایل</b>\n«📂 فایل‌ها» را بزنید، پوشه‌ها را باز کنید و فایل متنی را انتخاب کنید.\n\n<b>گام ۳ — Edit</b>\n«✏️ Edit» را بزنید. Bot Snapshot شاخهٔ پیش‌فرض را Pin می‌کند و Draft می‌سازد؛ در این مرحله هنوز GitHub WRITE نشده است.\n\n<b>گام ۴ — Editor</b>\n«🧑‍💻 Editor» را باز کنید، متن یا کد را داخل باکس ویرایش کنید و «ذخیره Draft» را بزنید. سپس به Workspace برگردید.\n\n<b>گام ۵ — Diff</b>\n«🔍 Diff» را بزنید و مطمئن شوید فقط تغییر موردنظر وجود دارد. اگر اشتباه است، دوباره Editor را باز کنید یا Draft را لغو کنید.\n\n<b>گام ۶ — پیام Commit</b>\n«✍️ پیام Commit» را بزنید و یک پیام روشن ارسال کنید؛ مثال: <code>docs: clarify bot guide</code>.\n\n<b>گام ۷ — آماده Commit</b>\n«✅ آماده Commit» را بزنید. Bot تغییر، Base و پیام Commit را بررسی و Intent را آماده می‌کند.\n\n<b>گام ۸ — Safe Approval</b>\nصفحهٔ Safe Approval باز می‌شود. «✅ تأیید و اجرا» تنها دکمه‌ای است که اجازهٔ WRITE نهایی را می‌دهد. «↩️ انصراف» عملیات را بدون WRITE متوقف می‌کند.\n\n<b>گام ۹ — Branch جدید</b>\nپس از تأیید، Commit روی Branch جدیدی با الگوی <code>nexa/edit-*</code> ساخته می‌شود. شاخهٔ <code>main</code> مستقیماً توسط این عملیات تغییر نمی‌کند.\n\n<b>گام ۱۰ — نتیجه</b>\nصفحهٔ موفقیت SHA و Branch را نشان می‌دهد. «🧪 CI / Actions» وضعیت اجراها را باز می‌کند، «📝 Workspace» به Draft مربوطه برمی‌گردد و «📦 پروژه» صفحهٔ Repository را باز می‌کند.\n\nتا زمانی که Branch جداگانه بررسی/ادغام نشده، تغییر روی شاخهٔ پیش‌فرض اعمال نشده است.`,

    5: `📘 <b>راهنمای Nexa Dev — V2</b>\n<b>۵. CI / Actions و کنترل اجراها</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>🧪 CI / Actions</b>\nWorkflow Runهای GitHub Actions را با وضعیت، Branch و SHA نمایش می‌دهد. دکمهٔ هر Run، جزئیات همان اجرا را باز می‌کند.\n\n<b>👷 Jobها</b>\nJobهای داخل Run و Stepهای هر Job را نشان می‌دهد. دکمهٔ نام هر Job جزئیات همان Job را باز می‌کند.\n\n<b>📦 Artifacts</b>\nArtifactهای Run، اندازه و وضعیت انقضا را نمایش می‌دهد. این نما خواندنی است.\n\n<b>📜 مشاهده log ناموفق</b>\nبرای Job شکست‌خورده، بخش محدودشده‌ای از log را برای عیب‌یابی نمایش می‌دهد.\n\n<b>🔁 اجرای مجدد jobهای ناموفق</b>\nیک عملیات WRITE روی GitHub Actions است؛ ابتدا Safe Approval می‌آید و فقط بعد از «تأیید و اجرا» درخواست rerun ارسال می‌شود.\n\n<b>⏹ لغو Workflow</b>\nبرای Run در حال اجرا/صف، درخواست Cancel می‌فرستد و مانند هر WRITE به Safe Approval نیاز دارد.\n\n<b>🔄 بروزرسانی</b>\nوضعیت Run/Job/فهرست را دوباره از GitHub می‌خواند.\n\n<b>⬅️ جدیدتر / قدیمی‌تر ➡️</b>\nبرای جابه‌جایی بین صفحات Runها، Artifactها یا سایر فهرست‌های صفحه‌بندی‌شده است.\n\n<b>🔙 Run / 🔙 Job / 🔙 CI / Actions</b>\nبه سطح قبلی جزئیات برمی‌گردد.\n\n<b>🧪 مشاهده Run</b>\nبعد از rerun/cancel موفق، همان Run را برای بررسی نتیجه باز می‌کند.`,

    6: `📘 <b>راهنمای Nexa Dev — V2</b>\n<b>۶. امنیت، خطاها و مسیرهای برگشت</b>\n➖➖➖➖➖➖➖➖➖➖\n\n<b>Safe Approval چیست؟</b>\nهر عملیات WRITE/DESTRUCTIVE مهم قبل از Provider متوقف می‌شود تا شما «✅ تأیید و اجرا» را بزنید. Token به Owner، Action، Target و زمان اعتبار متصل است و استفادهٔ دوباره رد می‌شود.\n\n<b>✅ تأیید و اجرا</b>\nفقط وقتی بزنید که Action و Target صفحهٔ تأیید را بررسی کرده‌اید. برای Workspace، نتیجه باید Branch جدا باشد؛ برای CI، rerun یا cancel همان Run است.\n\n<b>↩️ انصراف</b>\nSafe Approval را ترک می‌کند و هیچ عملیات Provider WRITE انجام نمی‌شود.\n\n<b>🔄 تلاش مجدد / Commit آمادهٔ تازه</b>\nدر خطاهای قابل‌بازیابی، درخواست را دوباره از State معتبر می‌سازد. اگر Approval منقضی یا قبلاً مصرف شده باشد باید Approval تازه ایجاد شود.\n\n<b>📝 Draft / Workspace</b>\nبرای ادامهٔ اصلاح بدون از دست‌دادن Context به Workspace محفوظ برمی‌گردد.\n\n<b>📦 پروژه / 🏠 منوی اصلی</b>\nمسیر بازیابی عمومی هستند و باید در خطاها و Cancel قابل‌دسترسی بمانند.\n\n<b>فایل‌های غیرقابل ویرایش</b>\nفایل‌های حساس مثل Secret/Key، محتوای باینری، Git LFS pointer یا فایل خارج از سقف Editor عمداً Edit نمی‌شوند.\n\n<b>اصل مهم Workspace</b>\nEditor و «ذخیره Draft» فقط State محلی Durable را تغییر می‌دهند. GitHub فقط پس از Diff → پیام Commit → آماده Commit → Safe Approval تغییر می‌کند.\n\n<b>اصل مهم Branch</b>\nWorkspace V2 مستقیم <code>main</code> را تغییر نمی‌دهد؛ Commit روی <code>nexa/edit-*</code> ساخته می‌شود تا قابل بررسی و کنترل باشد.`
  };
  return pages[Number(page)] || null;
}

export class GuideMenuManager extends MenuManager {
  getMainMenuView() {
    const view = super.getMainMenuView();
    const rows = [...view.reply_markup.inline_keyboard];
    const securityRowIndex = rows.findIndex(row => row.some(button => button.callback_data === 'menu:security'));
    if (securityRowIndex >= 0) {
      rows[securityRowIndex] = [
        ...rows[securityRowIndex],
        { text: '📘 راهنما', callback_data: 'menu:help' }
      ];
    } else {
      rows.push([{ text: '📘 راهنما', callback_data: 'menu:help' }]);
    }
    return { ...view, reply_markup: { ...view.reply_markup, inline_keyboard: rows } };
  }

  getGuideIndexView() {
    return {
      text:
`📘 <b>راهنمای Nexa Dev — V2</b>\n➖➖➖➖➖➖➖➖➖➖\nاین راهنما تمام دکمه‌های اصلی V2 و مسیر کامل اصلاح فایل را توضیح می‌دهد. موضوع موردنظر را انتخاب کنید:`,
      reply_markup: {
        inline_keyboard: [
          [{ text: `۱️⃣ ${GUIDE_TITLES[1]}`, callback_data: 'help:1' }],
          [{ text: `۲️⃣ ${GUIDE_TITLES[2]}`, callback_data: 'help:2' }],
          [{ text: `۳️⃣ ${GUIDE_TITLES[3]}`, callback_data: 'help:3' }],
          [{ text: `۴️⃣ ${GUIDE_TITLES[4]}`, callback_data: 'help:4' }],
          [{ text: `۵️⃣ ${GUIDE_TITLES[5]}`, callback_data: 'help:5' }],
          [{ text: `۶️⃣ ${GUIDE_TITLES[6]}`, callback_data: 'help:6' }],
          [{ text: '🏠 بازگشت به منوی اصلی', callback_data: 'menu:main' }]
        ]
      }
    };
  }

  getGuidePageView(page) {
    const text = guidePage(page);
    if (!text) return this.getGuideIndexView();
    return { text, reply_markup: guideNav(page) };
  }

  async renderByCallback(callbackData) {
    const value = String(callbackData || '');
    if (value === 'menu:help' || value === 'help:index') return this.getGuideIndexView();
    const match = value.match(/^help:([1-6])$/);
    if (match) return this.getGuidePageView(Number(match[1]));
    return super.renderByCallback(callbackData);
  }
}
