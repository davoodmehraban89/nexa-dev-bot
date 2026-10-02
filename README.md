# Nexa Dev Bot

ربات تلگرامی owner-only برای مشاهده و پایش مخازن GitHub از طریق Cloudflare Workers، با ناوبری Inline و ویرایش همان پیام به‌جای تولید پیام‌های پشت‌سرهم.

## قابلیت‌ها

- منوی اصلی: مخزن‌ها، وضعیت سرویس، ابزارهای توسعه، تنظیمات و امنیت.
- دریافت فهرست مخازن به‌صورت زنده از GitHub API؛ فهرست پروژه‌ها در کد ثابت نیست.
- مشاهده جزئیات مخزن، Pull Requestها، Commitها و وضعیت GitHub Actions.
- مرور فایل‌ها و پوشه‌ها و پیش‌نمایش فایل‌های متنی مناسب.
- ناوبری callback به‌صورت stateless؛ مسیرها از `callback_data` بازسازی می‌شوند و session دائمی داخل Worker نگهداری نمی‌شود.
- `/start` یک پیام منوی جدید ایجاد می‌کند؛ حرکت داخل منو با `editMessageText` همان پیام را ویرایش می‌کند.
- Webhook فقط برای مالک مجاز است و در نبود تنظیمات امنیتی/انتقالی لازم fail-closed می‌شود.
- خطاهای GitHub و Telegram صریح هستند و با داده ساختگی جایگزین نمی‌شوند.

## معماری

- `src/index.js` — مرز HTTP Worker، اعتبارسنجی webhook secret و owner، health/status و لاگ خطای redacted.
- `src/bot.js` — مسیریابی commandها و callbackها.
- `src/telegram.js` — کلاینت Telegram Bot API.
- `src/github.js` — GitHub REST reader احراز هویت‌شده.
- `src/menu.js` — تولید نماها و Inline Keyboardها.
- `src/config.js` — تنظیمات ثابت غیرحساس.
- `test/` — تست‌های امنیت، Worker، ناوبری، Telegram و GitHub.
- `.github/workflows/ci.yml` — اجرای تست‌ها روی Node 22 با گارد کشف غیرصفر تست‌ها.
- `.github/workflows/deploy.yml` — Deploy خودکار commit تأییدشده `main` به Cloudflare Workers پس از CI موفق.
- `wrangler.jsonc` — پیکربندی Worker.

## منوی ربات

```text
Nexa Dev
├── 📁 مخزن‌ها
│   └── <Repository>
│       ├── 📂 فایل‌ها
│       ├── 📝 Commitها
│       ├── 🔀 Pull Requestها
│       ├── 📊 وضعیت / تست‌ها
│       └── 🔙 بازگشت
├── 📊 وضعیت سرویس
├── 🔧 ابزارهای توسعه
├── ⚙️ تنظیمات
└── 🔐 امنیت
```

## تست

```bash
npm test
```

CI باید حداقل یک فایل تست پیدا کند؛ workflow در صورت کشف صفر تست fail می‌شود.

## تنظیمات Runtime در Cloudflare

این مقادیر باید به‌عنوان binding/secret روی Worker تنظیم شوند و نباید در Git ذخیره شوند:

- `TELEGRAM_BOT_TOKEN` — Secret
- `TELEGRAM_WEBHOOK_SECRET` — Secret
- `OWNER_TELEGRAM_ID` — شناسه عددی مالک مجاز
- `GITHUB_TOKEN` — Secret با حداقل دسترسی Read لازم به مخازن موردنظر
- `GITHUB_OWNER` — اختیاری؛ در صورت نبود از owner پیش‌فرض برنامه استفاده می‌شود

Webhook Production:

```text
POST /telegram/webhook
```

Telegram باید هدر `X-Telegram-Bot-Api-Secret-Token` را با مقدار متناظر `TELEGRAM_WEBHOOK_SECRET` ارسال کند.

## Deploy با GitHub Actions

برای workflow استقرار، این دو Repository Secret در GitHub Actions لازم‌اند:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

توکن Cloudflare باید فقط مجوزهای لازم برای Deploy Worker را داشته باشد. مقدار هیچ Secretی نباید داخل README، کد، workflow یا لاگ ثبت شود.

پس از موفقیت CI روی `main`، workflow استقرار همان commit تأییدشده را با Wrangler Deploy می‌کند. فایل پیکربندی معتبر پروژه `wrangler.jsonc` است.

## قواعد صحت و امنیت

- موفقیت CI به‌تنهایی اثبات رفتار Production نیست؛ Deployment و Smoke Test زنده باید جداگانه بررسی شوند.
- داده‌های GitHub در صورت خطای API نباید با fallback ساختگی جایگزین شوند.
- درخواست‌های کاربران غیرمالک بدون افشای داده خصوصی نادیده گرفته می‌شوند.
- خطاهای Runtime ثبت‌شده نباید حاوی Token یا Secret باشند.
