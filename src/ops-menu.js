import { GuideMenuManager } from './guide-menu.js';
import { DEFAULT_CONFIG } from './config.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const mark = (ok) => (ok ? '✅' : '❌');
const configuredText = (ok) => (ok ? '✅ پیکربندی شده' : '❌ پیکربندی نشده');

function backRow(text, callback) {
  return [{ text, callback_data: callback }];
}

export class OpsMenuManager extends GuideMenuManager {
  constructor(github, diagnostics) {
    super(github);
    this.diagnostics = diagnostics;
  }

  getMainMenuView() {
    const view = super.getMainMenuView();
    const inlineKeyboard = (view.reply_markup?.inline_keyboard || []).map(
      (row) =>
        row.map((button) =>
          button.callback_data === 'menu:settings'
            ? { ...button, text: '⚙️ پیکربندی' }
            : button
        )
    );
    return {
      ...view,
      reply_markup: { ...view.reply_markup, inline_keyboard: inlineKeyboard }
    };
  }

  getToolsView() {
    return {
      text: `🔧 <b>ابزارهای توسعه و عیب‌یابی</b>
<code>🏠 Nexa Dev &gt; 🔧 ابزارها</code>
➖➖➖➖➖➖➖➖➖➖
این بخش Diagnostics واقعی و فقط‌خواندنی Nexa است. هیچ‌کدام از ابزارهای این صفحه GitHub WRITE انجام نمی‌دهند.

• <b>خودآزمایی سیستم:</b> پیش‌نیازهای Runtime، امنیت، Durable Objectها و GitHub را یکجا بررسی می‌کند.
• <b>تست اتصال GitHub:</b> یک READ زنده اجرا و تعداد Repositoryهای قابل مشاهده را گزارش می‌کند.
• <b>Runtime / Bindings:</b> وضعیت پیکربندی Worker و Durable Objectها را بدون نمایش Secretها نشان می‌دهد.
• <b>Plugin Registry:</b> Pluginهای ثبت‌شده و تعداد Actionها را از Registry واقعی می‌خواند.
• <b>Ping داخلی:</b> فقط مسیر Callback و Render داخلی Bot را بررسی می‌کند.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🩺 خودآزمایی سیستم', callback_data: 'ops:selfcheck' }],
          [{ text: '🐙 تست اتصال GitHub', callback_data: 'ops:github' }],
          [
            { text: '🧱 Runtime / Bindings', callback_data: 'ops:runtime' },
            { text: '🧩 Plugin Registry', callback_data: 'ops:plugins' }
          ],
          [{ text: '🏓 Ping داخلی', callback_data: 'tool:ping' }],
          backRow('🔙 بازگشت به منوی اصلی', 'menu:main')
        ]
      }
    };
  }

  async getServiceStatusView() {
    const report = await this.diagnostics.runSelfCheck();
    const snapshot = report.snapshot;
    const github = report.github;
    const githubDetail = github.ok
      ? `✅ متصل؛ ${github.repositoryCount} Repository قابل مشاهده`
      : `❌ ناموفق؛ ${escapeHtml(github.error || 'خطای نامشخص')}`;

    return {
      text: `📊 <b>وضعیت زنده Nexa Dev</b>
<code>🏠 Nexa Dev &gt; 📊 وضعیت</code>
➖➖➖➖➖➖➖➖➖➖
• <b>Cloudflare Worker:</b> ✅ این درخواست داخل Worker اجرا شد.
• <b>Telegram Bot:</b> ${configuredText(snapshot.telegramConfigured)}
• <b>Webhook owner lock:</b> ${mark(snapshot.webhookSecretConfigured && snapshot.ownerConfigured)} ${snapshot.webhookSecretConfigured && snapshot.ownerConfigured ? 'فعال' : 'ناقص'}
• <b>GitHub live READ:</b> ${githubDetail}
• <b>WORKSPACE_STORE Durable Object:</b> ${configuredText(snapshot.workspaceStoreConfigured)}
• <b>APPROVAL_REPLAY_GUARD Durable Object:</b> ${configuredText(snapshot.replayGuardConfigured)}
• <b>Approval signer:</b> ${configuredText(snapshot.approvalSignerConfigured)}
• <b>Plugin Registry:</b> ${snapshot.pluginCount} Plugin / ${snapshot.actionCount} Action

<b>جمع‌بندی:</b> ${report.ok ? '✅ همهٔ کنترل‌های الزامی این Self-check پاس شدند.' : '⚠️ حداقل یک کنترل الزامی نیاز به بررسی دارد.'}

این صفحه latency، uptime یا SLA سرویس خارجی را بدون اندازه‌گیری واقعی ادعا نمی‌کند.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 بررسی مجدد', callback_data: 'menu:status' }],
          [{ text: '🩺 جزئیات Self-check', callback_data: 'ops:selfcheck' }],
          backRow('🔙 بازگشت به منوی اصلی', 'menu:main')
        ]
      }
    };
  }

  getSecurityView() {
    const snapshot = this.diagnostics.getSnapshot();
    return {
      text: `🔐 <b>مرکز امنیت Nexa Dev</b>
<code>🏠 Nexa Dev &gt; 🔐 امنیت</code>
➖➖➖➖➖➖➖➖➖➖
• <b>Owner-only boundary:</b> ${configuredText(snapshot.ownerConfigured)}
• <b>Webhook secret:</b> ${configuredText(snapshot.webhookSecretConfigured)}
• <b>Safe Approval signer:</b> ${configuredText(snapshot.approvalSignerConfigured)}
• <b>Replay protection:</b> ${configuredText(snapshot.replayGuardConfigured)}
• <b>Workspace isolation:</b> ${configuredText(snapshot.workspaceStoreConfigured)}
• <b>GitHub credential:</b> ${configuredText(snapshot.githubConfigured)}

فقط وضعیت پیکربندی نمایش داده می‌شود؛ مقدار Credential یا Secret هرگز در این صفحه نمایش داده نمی‌شود.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛡 خودآزمایی امنیت', callback_data: 'security:selfcheck' }],
          [
            { text: '📜 سیاست عملیات', callback_data: 'security:policy' },
            { text: '✅ Safe Approval', callback_data: 'security:approval' }
          ],
          backRow('🔙 بازگشت به منوی اصلی', 'menu:main')
        ]
      }
    };
  }

  getSettingsView() {
    const snapshot = this.diagnostics.getSnapshot();
    return {
      text: `⚙️ <b>مرکز پیکربندی Nexa Dev</b>
<code>🏠 Nexa Dev &gt; ⚙️ پیکربندی</code>
➖➖➖➖➖➖➖➖➖➖
این بخش در V2.1 عمداً <b>فقط‌خواندنی</b> است تا Secret یا تنظیم حساس از Telegram تغییر نکند.

• Runtime: <b>${escapeHtml(snapshot.runtime)}</b>
• مالک GitHub: <code>${escapeHtml(snapshot.githubOwner)}</code>
• Editor: <b>Telegram Mini App</b>
• Pluginها: <b>${snapshot.pluginCount}</b>

برای مشاهده جزئیات هر حوزه یکی از گزینه‌های زیر را باز کنید.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🧱 Runtime', callback_data: 'config:runtime' },
            { text: '🔗 Providerها', callback_data: 'config:providers' }
          ],
          [
            { text: '🧑‍💻 Editor', callback_data: 'config:editor' },
            { text: '🧩 Pluginها', callback_data: 'config:plugins' }
          ],
          backRow('🔙 بازگشت به منوی اصلی', 'menu:main')
        ]
      }
    };
  }

  async getSelfCheckView(backCallback = 'menu:tools') {
    const report = await this.diagnostics.runSelfCheck();
    const lines = report.checks
      .map((check) => {
        const detail = check.detail ? ` — ${escapeHtml(check.detail)}` : '';
        return `• ${mark(check.ok)} <b>${escapeHtml(check.label)}</b>${detail}`;
      })
      .join('\n');
    return {
      text: `🩺 <b>Self-check Nexa Dev</b>
➖➖➖➖➖➖➖➖➖➖
${lines}

<b>نتیجه:</b> ${report.ok ? '✅ PASS' : '❌ ATTENTION REQUIRED'}
این بررسی READ-only است و هیچ Provider mutation اجرا نمی‌کند.`,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 اجرای مجدد',
              callback_data:
                backCallback === 'menu:security'
                  ? 'security:selfcheck'
                  : 'ops:selfcheck'
            }
          ],
          backRow(
            backCallback === 'menu:security' ? '🔙 مرکز امنیت' : '🔙 ابزارها',
            backCallback
          )
        ]
      }
    };
  }

  async getGitHubProbeView(
    backCallback = 'menu:tools',
    refreshCallback = 'ops:github'
  ) {
    const probe = await this.diagnostics.probeGitHub();
    return {
      text: probe.ok
        ? `🐙 <b>تست اتصال GitHub</b>\n➖➖➖➖➖➖➖➖➖➖\n✅ READ زنده موفق بود.\nمالک: <code>${escapeHtml(probe.owner)}</code>\nRepositoryهای قابل مشاهده: <b>${probe.repositoryCount}</b>\n\nهیچ WRITEای انجام نشد.`
        : `🐙 <b>تست اتصال GitHub</b>\n➖➖➖➖➖➖➖➖➖➖\n❌ READ زنده ناموفق بود.\n${escapeHtml(probe.error || 'خطای نامشخص')}\n\nهیچ وضعیت موفق ساختگی نمایش داده نمی‌شود.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 تست دوباره', callback_data: refreshCallback }],
          backRow(
            backCallback === 'menu:settings' ? '🔙 پیکربندی' : '🔙 ابزارها',
            backCallback
          )
        ]
      }
    };
  }

  getRuntimeView(backCallback = 'menu:tools') {
    const snapshot = this.diagnostics.getSnapshot();
    return {
      text: `🧱 <b>Runtime / Bindings</b>
➖➖➖➖➖➖➖➖➖➖
• Runtime: <b>${escapeHtml(snapshot.runtime)}</b>
• Telegram Bot: ${configuredText(snapshot.telegramConfigured)}
• Webhook secret: ${configuredText(snapshot.webhookSecretConfigured)}
• Owner lock: ${configuredText(snapshot.ownerConfigured)}
• GitHub credential: ${configuredText(snapshot.githubConfigured)}
• WORKSPACE_STORE: ${configuredText(snapshot.workspaceStoreConfigured)}
• APPROVAL_REPLAY_GUARD: ${configuredText(snapshot.replayGuardConfigured)}
• Approval signer: ${configuredText(snapshot.approvalSignerConfigured)}

این صفحه فقط وجود پیکربندی را نشان می‌دهد و هیچ Secretی را چاپ نمی‌کند.`,
      reply_markup: {
        inline_keyboard: [
          backRow(
            backCallback === 'menu:settings' ? '🔙 پیکربندی' : '🔙 ابزارها',
            backCallback
          )
        ]
      }
    };
  }

  getPluginsView(backCallback = 'menu:tools') {
    const summary = this.diagnostics.getPluginSummary();
    const items = summary.plugins.length
      ? summary.plugins
          .map(
            (plugin) =>
              `• <b>${escapeHtml(plugin.id)}</b>: ${plugin.actionCount} Action — READ ${plugin.risks.READ} / WRITE ${plugin.risks.WRITE} / DESTRUCTIVE ${plugin.risks.DESTRUCTIVE}`
          )
          .join('\n')
      : '<i>Plugin ثبت‌شده‌ای یافت نشد.</i>';
    return {
      text: `🧩 <b>Plugin Registry</b>
➖➖➖➖➖➖➖➖➖➖
Pluginها: <b>${summary.pluginCount}</b>
Actionها: <b>${summary.actionCount}</b>

${items}`,
      reply_markup: {
        inline_keyboard: [
          backRow(
            backCallback === 'menu:settings' ? '🔙 پیکربندی' : '🔙 ابزارها',
            backCallback
          )
        ]
      }
    };
  }

  getSecurityPolicyView() {
    return {
      text: `📜 <b>سیاست عملیات Nexa Dev</b>
➖➖➖➖➖➖➖➖➖➖
• <b>READ:</b> فقط برای Owner مجاز است و بدون Safe Approval قابل اجراست.
• <b>WRITE:</b> قبل از Provider mutation به Safe Approval معتبر و Owner-bound نیاز دارد.
• <b>DESTRUCTIVE:</b> باید پشت همان Policy مرکزی و تأیید صریح باقی بماند؛ این مرکز امنیت هیچ مسیر دورزدنی ایجاد نمی‌کند.
• Approval token به Owner / Action / Risk / Target / Expiry متصل و یک‌بارمصرف است.
• Source، Draft، Secret و Signed token نباید وارد Audit log شوند.`,
      reply_markup: {
        inline_keyboard: [backRow('🔙 مرکز امنیت', 'menu:security')]
      }
    };
  }

  getApprovalStatusView() {
    const snapshot = this.diagnostics.getSnapshot();
    return {
      text: `✅ <b>وضعیت Safe Approval</b>
➖➖➖➖➖➖➖➖➖➖
• Signer: ${configuredText(snapshot.approvalSignerConfigured)}
• Durable replay guard: ${configuredText(snapshot.replayGuardConfigured)}
• Owner lock: ${configuredText(snapshot.ownerConfigured)}

WRITE فقط بعد از تأیید معتبر اجرا می‌شود و Approval مصرف‌شده دوباره قابل استفاده نیست.`,
      reply_markup: {
        inline_keyboard: [backRow('🔙 مرکز امنیت', 'menu:security')]
      }
    };
  }

  getProvidersView() {
    const snapshot = this.diagnostics.getSnapshot();
    return {
      text: `🔗 <b>Providerها و اتصال‌ها</b>
➖➖➖➖➖➖➖➖➖➖
• GitHub owner: <code>${escapeHtml(snapshot.githubOwner)}</code>
• GitHub credential: ${configuredText(snapshot.githubConfigured)}
• Telegram Bot credential: ${configuredText(snapshot.telegramConfigured)}
• Telegram Webhook secret: ${configuredText(snapshot.webhookSecretConfigured)}

مقادیر Credential نمایش داده نمی‌شوند. برای اعتبارسنجی Provider، تست READ زنده GitHub را مستقیماً اجرا کنید.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🐙 تست زنده GitHub', callback_data: 'config:github' }],
          backRow('🔙 پیکربندی', 'menu:settings')
        ]
      }
    };
  }

  getEditorConfigView() {
    return {
      text: `🧑‍💻 <b>پیکربندی Workspace Editor</b>
➖➖➖➖➖➖➖➖➖➖
• نوع: <b>Telegram Mini App</b>
• URL: <code>${escapeHtml(DEFAULT_CONFIG.workspaceEditorUrl)}</code>
• ذخیره: <b>Durable Draft در WORKSPACE_STORE</b>
• GitHub WRITE مستقیم از Editor: <b>ندارد</b>
• Commit نهایی: <b>Branch-only + Safe Approval</b>`,
      reply_markup: {
        inline_keyboard: [backRow('🔙 پیکربندی', 'menu:settings')]
      }
    };
  }

  async renderByCallback(callbackData) {
    const [action, target] = String(callbackData || '').split(':');

    if (action === 'menu') {
      if (target === 'status') return this.getServiceStatusView();
      if (target === 'tools') return this.getToolsView();
      if (target === 'security') return this.getSecurityView();
      if (target === 'settings') return this.getSettingsView();
    }

    if (action === 'ops') {
      if (target === 'selfcheck') return this.getSelfCheckView('menu:tools');
      if (target === 'github') return this.getGitHubProbeView();
      if (target === 'runtime') return this.getRuntimeView('menu:tools');
      if (target === 'plugins') return this.getPluginsView('menu:tools');
    }

    if (action === 'security') {
      if (target === 'selfcheck') return this.getSelfCheckView('menu:security');
      if (target === 'policy') return this.getSecurityPolicyView();
      if (target === 'approval') return this.getApprovalStatusView();
    }

    if (action === 'config') {
      if (target === 'runtime') return this.getRuntimeView('menu:settings');
      if (target === 'providers') return this.getProvidersView();
      if (target === 'github')
        return this.getGitHubProbeView('menu:settings', 'config:github');
      if (target === 'editor') return this.getEditorConfigView();
      if (target === 'plugins') return this.getPluginsView('menu:settings');
    }

    return super.renderByCallback(callbackData);
  }
}
