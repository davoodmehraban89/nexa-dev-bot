# Nexa Dev Bot

ربات تلگرامی owner-only برای مشاهده، پایش و اجرای کنترل‌شده عملیات توسعه روی GitHub از طریق Cloudflare Workers، با ناوبری Inline و ویرایش همان پیام به‌جای تولید پیام‌های پشت‌سرهم.

## قابلیت‌ها

- منوی اصلی: مخزن‌ها، وضعیت سرویس، ابزارهای توسعه، تنظیمات و امنیت.
- دریافت فهرست مخازن به‌صورت زنده از GitHub API؛ فهرست پروژه‌ها در کد ثابت نیست.
- مشاهده جزئیات مخزن، Pull Requestها، Commitها و وضعیت GitHub Actions.
- مشاهده Workflow Runها و Job/Stepهای GitHub Actions.
- اجرای کنترل‌شده `Re-run failed jobs` و `Cancel workflow run` فقط بعد از تأیید صریح مالک در تلگرام.
- Approval tokenهای کوتاه‌عمر، HMAC-signed، owner-bound و action-bound؛ callback تأیید داخل محدودیت ۶۴ بایتی Telegram نگه داشته می‌شود.
- مرور فایل‌ها و پوشه‌ها و پیش‌نمایش فایل‌های متنی مناسب.
- ناوبری callback به‌صورت stateless؛ مسیرها از `callback_data` بازسازی می‌شوند و session دائمی برای navigation داخل Worker نگهداری نمی‌شود.
- `/start` یک پیام منوی جدید ایجاد می‌کند؛ حرکت داخل منو با `editMessageText` همان پیام را ویرایش می‌کند.
- Webhook فقط برای مالک مجاز است و در نبود تنظیمات امنیتی/انتقالی لازم fail-closed می‌شود.
- خطاهای GitHub و Telegram صریح هستند و با داده ساختگی جایگزین نمی‌شوند.

## معماری

- `src/index.js` — مرز HTTP Worker، اعتبارسنجی webhook secret و owner، health/status و لاگ خطای redacted.
- `src/bot.js` — مسیریابی command/callback و هماهنگی approval flow.
- `src/core/action-policy.js` — سیاست مرکزی `READ` / `WRITE` / `DESTRUCTIVE`.
- `src/core/approval.js` — صدور و اعتبارسنجی approval tokenهای امضاشده و جلوگیری از replay در سطح Worker isolate.
- `src/core/router.js` — اجرای `resolve -> policy -> execute` و جلوگیری از provider call قبل از approval.
- `src/plugins/github/` — manifest و adapter عملیات GitHub.
- `src/telegram.js` — کلاینت Telegram Bot API.
- `src/github.js` — کلاینت احراز هویت‌شده GitHub REST API.
- `src/menu.js` — تولید نماها و Inline Keyboardها.
- `src/config.js` — تنظیمات ثابت غیرحساس.
- `test/` — تست‌های امنیت، approval، Worker، ناوبری، Telegram و GitHub.
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
│       ├── 🧪 CI / Actions
│       │   └── <Workflow Run>
│       │       ├── Job / Stepها
│       │       ├── Re-run failed jobs → نیازمند تأیید
│       │       └── Cancel run → نیازمند تأیید
│       └── 🔙 بازگشت
├── 📊 وضعیت سرویس
├── 🔧 ابزارهای توسعه
├── ⚙️ تنظیمات
└── 🔐 امنیت
```

## تست و اجرای محلی

```bash
npm test
npm start
```

`npm start`، `wrangler dev` را از طریق `npx` اجرا می‌کند. CI باید حداقل یک فایل تست پیدا کند؛ workflow در صورت کشف صفر تست fail می‌شود.

## تنظیمات Runtime در Cloudflare

این مقادیر باید به‌عنوان binding/secret روی Worker تنظیم شوند و نباید در Git ذخیره شوند:

- `TELEGRAM_BOT_TOKEN` — Secret
- `TELEGRAM_WEBHOOK_SECRET` — Secret؛ علاوه بر اعتبارسنجی webhook، fallback امن امضای approval است
- `APPROVAL_SIGNING_SECRET` — اختیاری؛ اگر تنظیم شود برای امضای approval بر `TELEGRAM_WEBHOOK_SECRET` اولویت دارد
- `OWNER_TELEGRAM_ID` — شناسه عددی مالک مجاز
- `GITHUB_TOKEN` — Secret؛ برای READ حداقل دسترسی خواندن و برای کنترل GitHub Actions مجوزهای لازم Actions لازم است
- `GITHUB_OWNER` — اختیاری؛ در صورت نبود از owner پیش‌فرض برنامه استفاده می‌شود

Webhook Production:

```text
POST /telegram/webhook
```

Telegram باید هدر `X-Telegram-Bot-Api-Secret-Token` را با مقدار متناظر `TELEGRAM_WEBHOOK_SECRET` ارسال کند.

## Safe Actions

- `READ` برای مالک مجاز بدون confirmation اجرا می‌شود.
- `WRITE` و `DESTRUCTIVE` در اولین درخواست اجرا نمی‌شوند و ابتدا confirmation می‌خواهند.
- تأیید معتبر فقط همان action، owner و target امضاشده را مجاز می‌کند.
- لغو approval هیچ provider mutationی انجام نمی‌دهد و به نمای امن قبلی بازمی‌گردد.
- replay protection فعلی در سطح یک Cloudflare Worker isolate برقرار است؛ durable cross-isolate replay protection در فاز Hardening نهایی می‌شود.
- اگر GitHub token مجوز لازم برای Action write نداشته باشد، خطای provider صریح نمایش داده می‌شود و موفقیت ساختگی گزارش نمی‌شود.

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
- عملیات GitHub write نباید قبل از approval provider call بزند.
- خطاهای Runtime ثبت‌شده نباید حاوی Token، Secret یا approval token باشند.
