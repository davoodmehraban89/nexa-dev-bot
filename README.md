# Nexa Dev Bot

ربات تلگرامی owner-only برای مشاهده، پایش، عیب‌یابی و اجرای کنترل‌شدهٔ عملیات توسعه روی GitHub از طریق Cloudflare Workers. رابط اصلی بر پایهٔ Inline Keyboard، منوی ثابت پایین Telegram و ویرایش همان پیام است تا مسیرها بدون تولید پیام‌های زائد قابل پیگیری بمانند.

## وضعیت فعلی — V2.1

V2.1 شامل Workspace Editor، Ops Console، Security Center، Configuration Center فقط‌خواندنی و راهنمای داخلی Bot است. عملیات READ برای مالک مجاز مستقیم اجرا می‌شود؛ WRITE و DESTRUCTIVE از Policy مرکزی و Safe Approval عبور می‌کنند.

## قابلیت‌ها

- منوی اصلی: پروژه‌ها، وضعیت، ابزارهای توسعه، پیکربندی، امنیت و راهنما.
- دریافت فهرست Repositoryهای قابل‌دسترسی به‌صورت زنده از GitHub API.
- مشاهده جزئیات Repository، Pull Requestها، Commitها، Branchها، Issues، Releases و GitHub Actions؛ Issue و Release دارای drill-down منبع‌محور برای توضیح، وضعیت، برچسب/مسئول و Release notes هستند.
- مشاهده Workflow Run، Job، Step و Artifact metadata؛ لاگ خام در GitHub باز می‌شود و وارد پیام تلگرام نمی‌شود.
- اجرای کنترل‌شدهٔ `Re-run failed jobs` و `Cancel workflow run` فقط بعد از Safe Approval.
- مرور پوشه‌ها و اطلاعات فایل در تلگرام؛ مشاهدهٔ محتوای فایل متنی مجاز و Diff در Mini App احراز هویت‌شده، با نمایش فقط‌خواندنی.
- Workspace Editor برای اصلاح یک **multi-file Change Set** محدود و پایدار، بدون WRITE مستقیم به GitHub؛ حالت تک‌فایل با **single-file compatibility** به‌صورت Change Set یک‌عضوی حفظ شده است.
- Telegram Mini App چندخطی برای ویرایش Draft؛ مسیر Paste عادی Telegram فقط fallback است.
- ساخت Commit روی Branch جداگانه به شکل `nexa/edit-*`؛ مسیر Workspace به‌صورت مستقیم `main` را تغییر نمی‌دهد.
- Ops Console فقط‌خواندنی برای Self-check، GitHub READ probe، Cloudflare Worker READ status، Runtime/Bindings، Plugin Registry و Ping داخلی.
- Security Center برای وضعیت Owner-only، Safe Approval، Replay Guard و Policy عملیات.
- ⚙️ پیکربندی در V2.1 عمداً فقط‌خواندنی است و Runtime، Providerها، Editor و Pluginها را بدون نمایش Secret نشان می‌دهد.
- `/start` و `/menu` منوی ثابت پایین را نصب/بازسازی می‌کنند و `/help` راهنمای داخلی را باز می‌کند.
- خطاهای GitHub، Telegram و Runtime صریح گزارش می‌شوند و با دادهٔ ساختگی جایگزین نمی‌شوند.

## Workspace Editor

مرجع سقف‌های فعلی `WORKSPACE_EDITOR_LIMITS` در `src/core/workspace-policy.js` است: هر فایل حداکثر **۲۰٬۰۰۰ نویسهٔ Unicode و ۶۵٬۵۳۶ بایت UTF-8**، هر Change Set حداکثر **۸ فایل و ۱۳۱٬۰۷۲ بایت**. صفحهٔ Editor، API و پیام راهنما از همین مرجع استفاده می‌کنند. ورودی کد از Paste یا فایل تلگرام غیرفعال است؛ متن منبع فقط در Mini App احراز هویت‌شده ویرایش می‌شود. محدودیت ۳٬۰۰۰/۱۲٬۰۰۰ در طرح‌های تاریخی Phase 1 دیگر مقدار جاری نیست.

لینک Editor در webhook به همان دامنهٔ Worker اشاره می‌کند. برای دامنهٔ سفارشی، `WORKSPACE_EDITOR_URL` را روی آدرس HTTPS با مسیر دقیق `/workspace/editor` قرار دهید؛ وجود نام کاربری، رمز، query یا fragment پیکربندی را نامعتبر و لینک‌ها را غیرفعال می‌کند. مقدار این متغیر عمومی است و نباید توکن داشته باشد.

قرارداد توسعهٔ Nexa Studio نسخهٔ ۳ در [docs/contract/NEXA_STUDIO_V3.md](docs/contract/NEXA_STUDIO_V3.md) و فایل Word اصلی کنار آن نگهداری می‌شود. برچسب محصول V2.1 مربوط به بات موجود است؛ نسخهٔ انتشار کد از `package.json` خوانده می‌شود و با شمارهٔ قرارداد یکی نیست.

ورودی اصلی و جریان ویرایش:

1. `/start` در بات → دکمهٔ **باز کردن Nexa Studio**. دکمهٔ منوی چت مالک نیز Mini App را باز می‌کند.
2. داخل Mini App در `/studio/`: انتخاب مخزن واقعی و مرور فایل‌ها.
3. انتخاب فایل متنی مجاز → Pin شدن **exact base SHA** و ساخت Workspace/Change Set.
4. ویرایش چندفایلی در CodeMirror 6، جست‌وجو و Undo/Redo؛ کد LTR و برنامه فارسی RTL است.
5. `ذخیره تغییرات` → فقط Draft در `WORKSPACE_STORE` با revision و `If-Match` ذخیره می‌شود؛ تضاد نسخه 409 و انتخاب صریح دارد.
6. `بازبینی تغییرات` → نمایش Diff و ثبت پیام Commit در همان Mini App.
7. `درخواست تأیید امن` → اتصال اتمیک تأیید به همان نسخهٔ فایل‌ها و همان پیام بررسی‌شده؛ تغییر هم‌زمان نیازمند بازبینی تازه است.
8. تأیید نهایی از پیام امضاشدهٔ بات → Commit و Branch مستقل `nexa/edit-*`؛ `main` مستقیم تغییر نمی‌کند.

برنامه پس از بازشدن دوباره می‌تواند فضای کار قبلی را از سرور ادامه دهد؛ فقط شناسهٔ تصادفی فضای کار روی دستگاه نگهداری می‌شود، نه کد یا توکن. این نسخه از دسترسی فعلی مالک استفاده می‌کند و ویزارد اتصال PAT، سشن و Grant چندکاربره یا پذیرش کامل G1 را پیاده‌سازی‌شده نمی‌داند.

کد رابط در `web/` است و با `npm run build:web` در `web/dist` ساخته می‌شود؛ Static Assets از همان Worker و با CSP بدون `unsafe-inline` ارائه می‌شود. برای دامنهٔ سفارشی ورودی، `STUDIO_URL` باید HTTPS با مسیر `/studio/` و بدون query، fragment یا اطلاعات ورود باشد.

فایل‌های حساس، محتوای binary-like، Git LFS و موارد خارج از Policy قابل Edit نیستند.

## معماری

- `src/index.js` — مرز HTTP Worker، webhook، health/status عمومی، Workspace Editor HTTP/Mini App و export Durable Objectها.
- `src/bot.js` — command/callback routing، persistent menu و هماهنگی approval flow.
- `src/guide-bot.js` / `src/guide-menu.js` — راهنمای داخلی V2.1.
- `src/ops-menu.js` — صفحات Ops Console، Security Center و پیکربندی فقط‌خواندنی.
- `src/core/runtime-diagnostics.js` — self-check و diagnostics امن و source-backed.
- `src/core/action-policy.js` — Policy مرکزی `READ` / `WRITE` / `DESTRUCTIVE`.
- `src/core/approval.js` — صدور/اعتبارسنجی Approval tokenهای HMAC-signed و owner/action/target-bound.
- `src/core/durable-replay-store.js` — adapter دسترسی به Replay Guard.
- `src/durable/approval-replay-guard.js` — Durable Object برای مصرف اتمیک و یک‌بارهٔ Approval.
- `src/durable/workspace-store.js` — Durable Object برای Workspace، Draft، refs و pending inputهای owner-scoped.
- `src/workspace-editor.js` — Telegram Mini App، validation و API ذخیرهٔ Draft.
- `src/core/router.js` — الگوی `resolve -> policy -> execute` و جلوگیری از provider mutation پیش از Approval.
- `src/plugins/github/` — manifest، menu و orchestration عملیات GitHub و Workspace.
- `src/plugins/cloudflare/` — Cloudflare API READ service و Plugin فقط‌خواندنی برای Deployment/Version، Binding metadata و Observability.
- `src/cloudflare-menu.js` — افزودن مسیر Cloudflare status به Ops Console بدون تغییر قراردادهای پایه.
- `src/github.js` — کلاینت احراز هویت‌شده GitHub REST API.
- `src/telegram.js` — کلاینت Telegram Bot API.
- `test/` — تست‌های policy، approval، replay، workspace، editor، guide، ops، Worker و integrations.

## منوی ربات

```text
Nexa Dev
├── 📁 پروژه‌ها
│   └── <Repository>
│       ├── 📂 فایل‌ها
│       │   └── ✏️ Edit → Workspace Editor
│       ├── 📝 Commitها
│       ├── 🔀 Pull Requestها → فهرست پیشرفته و جزئیات PR
│       ├── 📊 وضعیت / تست‌ها → CI / Actions و جزئیات Workflow Run
│       ├── 🌿 Branches
│       ├── 🐛 Issues
│       └── 🏷 Releases
├── 📊 وضعیت
├── 🔧 ابزارها / Ops Console
│   └── ☁️ Cloudflare status → Deployment / Version / Bindings / Observability
├── ⚙️ پیکربندی
├── 🔐 امنیت
└── 📘 راهنما
```

در صفحهٔ Repository برای PR و CI فقط یک ورودی canonical نمایش داده می‌شود؛ callbackهای قدیمی سازگار مانده‌اند اما ورودی تکراری در UI ندارند.

## Durable Objects

### `APPROVAL_REPLAY_GUARD`

Replay protection پایدار و cross-isolate برای جلوگیری از اجرای دوبارهٔ Approval مصرف‌شده. اگر Binding در Runtime در دسترس نباشد، عملیات WRITE به‌صورت fail-closed اجرا نمی‌شود.

### `WORKSPACE_STORE`

Workspace، Draft، short navigation refs، pending input و Commit intent را به‌صورت owner-scoped نگه می‌دارد. ذخیرهٔ Draft در Workspace Editor به‌تنهایی GitHub WRITE انجام نمی‌دهد.

## Safe Approval

- `READ` فقط برای Owner مجاز بدون confirmation اجرا می‌شود.
- `WRITE` و `DESTRUCTIVE` در درخواست اولیه Provider mutation انجام نمی‌دهند.
- Approval معتبر به Owner، Action، Risk، Target و Expiry متصل است.
- عملیات `DESTRUCTIVE` علاوه بر Safe Approval به TOTP مستقل نیز نیاز دارد؛ کد TOTP و Secret آن وارد Audit/Log نمی‌شوند.
- Replay Guard مصرف یک‌باره را حتی بین Worker isolateهای مختلف enforce می‌کند.
- لغو Approval هیچ mutationی انجام نمی‌دهد.
- Provider failure باید صریح نمایش داده شود؛ Success ساختگی ممنوع است.

## مرز HTTP و Telegram

- `POST /telegram/webhook` مسیر Production Telegram است و باید Secret Token معتبر داشته باشد.
- صفحات تشخیصی کامل داخل Telegram پشت مرز Owner-only قرار دارند.
- `GET /status` عمومی عمداً حداقلی است و جزئیات Binding، وجود Credential یا خطاهای حساس Provider را افشا نمی‌کند.
- Workspace Mini App درخواست‌های Editor را با Telegram `initData` معتبر و owner-bound می‌پذیرد.

## Runtime در Cloudflare

Bindings/Secrets اصلی:

- `TELEGRAM_BOT_TOKEN` — Secret
- `TELEGRAM_WEBHOOK_SECRET` — Secret و fallback امن امضای Approval
- `APPROVAL_SIGNING_SECRET` — اختیاری؛ در صورت وجود برای امضا اولویت دارد
- `DESTRUCTIVE_TOTP_SECRET` — Secret مستقل Base32 برای عامل دوم عملیات `DESTRUCTIVE`؛ بدون آن عملیات مخرب fail-closed می‌شود
- `OWNER_TELEGRAM_ID` — Owner مجاز
- `GITHUB_TOKEN` — Secret
- `GITHUB_OWNER` — اختیاری
- `CLOUDFLARE_API_TOKEN` — Secret؛ فقط برای READهای Cloudflare Ops Plugin
- `CLOUDFLARE_ACCOUNT_ID` — شناسهٔ حساب Cloudflare مورد استفادهٔ Plugin
- `CLOUDFLARE_WORKER_NAME` — اختیاری؛ پیش‌فرض `nexa-dev-bot`
- `APPROVAL_REPLAY_GUARD` — Durable Object binding
- `WORKSPACE_STORE` — Durable Object binding

مقدار Secretها نباید در کد، README، پیام تشخیصی یا Log ثبت شود.

## CI، Deploy و Worker Preview

- `.github/workflows/ci.yml` تست‌ها را روی Node 22 اجرا می‌کند و کشف صفر تست را fail می‌کند.
- `.github/workflows/deploy.yml` پس از CI موفق روی `main` همان Commit تأییدشده را به Cloudflare Workers Deploy می‌کند.
- Production Deploy باید SHA دقیق checkout شده را حفظ کند؛ موفقیت CI به‌تنهایی اثبات Production نیست.
- Worker Preview برای Branch/PR از Production جداست.
- Durable Objectهای Preview Bindingهای جداگانه دارند تا Workspace state یا Replay state آزمایشی با Production مخلوط نشود.
- Observability/logging برای بررسی Runtime فعال است؛ Smoke و Deployment verification باید مستقل از CI بررسی شوند.

## تست و اجرای محلی

```bash
npm test
npm start
```

`npm start`، `wrangler dev` را اجرا می‌کند.

## قواعد صحت و امنیت

- دادهٔ GitHub و Cloudflare در صورت API failure با fallback ساختگی جایگزین نمی‌شود.
- Cloudflare Ops Phase 1 فقط READ است و هیچ Deploy، Rollback یا تغییر تنظیمات Cloudflare از Telegram اجرا نمی‌کند.
- درخواست کاربر غیرمالک بدون افشای دادهٔ خصوصی نادیده گرفته می‌شود.
- GitHub WRITE نباید پیش از Approval معتبر Provider call بزند.
- Source، Draft، Secret و Signed Approval token نباید وارد Audit log یا diagnostics شوند.
- Public `/status` فقط health حداقلی می‌دهد؛ جزئیات عملیاتی متعلق به Telegram owner-only است.
- Production، Preview و Durable state آزمایشی باید از هم تفکیک بمانند.
