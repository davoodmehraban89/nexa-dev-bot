# Nexa Dev Bot

ربات تلگرامی owner-only برای مشاهده، پایش، عیب‌یابی و اجرای کنترل‌شدهٔ عملیات توسعه روی GitHub از طریق Cloudflare Workers. رابط اصلی بر پایهٔ Inline Keyboard، منوی ثابت پایین Telegram و ویرایش همان پیام است تا مسیرها بدون تولید پیام‌های زائد قابل پیگیری بمانند.

## وضعیت فعلی — V2.1

V2.1 شامل Workspace Editor، Ops Console، Security Center، Configuration Center فقط‌خواندنی و راهنمای داخلی Bot است. عملیات READ برای مالک مجاز مستقیم اجرا می‌شود؛ WRITE و DESTRUCTIVE از Policy مرکزی و Safe Approval عبور می‌کنند.

## قابلیت‌ها

- منوی اصلی: پروژه‌ها، وضعیت، ابزارهای توسعه، پیکربندی، امنیت و راهنما.
- دریافت فهرست Repositoryهای قابل‌دسترسی به‌صورت زنده از GitHub API.
- مشاهده جزئیات Repository، Pull Requestها، Commitها، Branchها، Issues، Releases و GitHub Actions؛ Issue و Release دارای drill-down منبع‌محور برای توضیح، وضعیت، برچسب/مسئول و Release notes هستند.
- مشاهده Workflow Run، Job، Step، bounded log و Artifact metadata.
- اجرای کنترل‌شدهٔ `Re-run failed jobs` و `Cancel workflow run` فقط بعد از Safe Approval.
- مرور پوشه‌ها و فایل‌ها و پیش‌نمایش فایل‌های متنی مناسب.
- Workspace Editor برای اصلاح فایل روی Draft پایدار، بدون WRITE مستقیم به GitHub.
- Telegram Mini App چندخطی برای ویرایش Draft؛ مسیر Paste عادی Telegram فقط fallback است.
- ساخت Commit روی Branch جداگانه به شکل `nexa/edit-*`؛ مسیر Workspace به‌صورت مستقیم `main` را تغییر نمی‌دهد.
- Ops Console فقط‌خواندنی برای Self-check، GitHub READ probe، Runtime/Bindings، Plugin Registry و Ping داخلی.
- Security Center برای وضعیت Owner-only، Safe Approval، Replay Guard و Policy عملیات.
- ⚙️ پیکربندی در V2.1 عمداً فقط‌خواندنی است و Runtime، Providerها، Editor و Pluginها را بدون نمایش Secret نشان می‌دهد.
- `/start` و `/menu` منوی ثابت پایین را نصب/بازسازی می‌کنند و `/help` راهنمای داخلی را باز می‌کند.
- خطاهای GitHub، Telegram و Runtime صریح گزارش می‌شوند و با دادهٔ ساختگی جایگزین نمی‌شوند.

## Workspace Editor

جریان ویرایش فایل:

1. `پروژه‌ها` → انتخاب Repository.
2. `فایل‌ها` → انتخاب فایل متنی مجاز.
3. `Edit` → Pin شدن Base snapshot و ساخت Workspace.
4. `Editor` → باز شدن Telegram Mini App.
5. `ذخیره Draft` → فقط Draft داخل `WORKSPACE_STORE` به‌روزرسانی می‌شود.
6. `Diff` → مقایسه Original و Draft.
7. `پیام Commit` → ثبت پیام Commit.
8. `آماده Commit` → اعتبارسنجی و ساخت Intent امن.
9. `Safe Approval` → فقط بعد از «تأیید و اجرا» Provider WRITE مجاز می‌شود.
10. Bot یک Commit و Branch مستقل `nexa/edit-*` می‌سازد؛ `main` مستقیم تغییر نمی‌کند.

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
- `OWNER_TELEGRAM_ID` — Owner مجاز
- `GITHUB_TOKEN` — Secret
- `GITHUB_OWNER` — اختیاری
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

- دادهٔ GitHub در صورت API failure با fallback ساختگی جایگزین نمی‌شود.
- درخواست کاربر غیرمالک بدون افشای دادهٔ خصوصی نادیده گرفته می‌شود.
- GitHub WRITE نباید پیش از Approval معتبر Provider call بزند.
- Source، Draft، Secret و Signed Approval token نباید وارد Audit log یا diagnostics شوند.
- Public `/status` فقط health حداقلی می‌دهد؛ جزئیات عملیاتی متعلق به Telegram owner-only است.
- Production، Preview و Durable state آزمایشی باید از هم تفکیک بمانند.