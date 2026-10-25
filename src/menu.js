import { DEFAULT_CONFIG } from './config.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function callbackFits(value) {
  return new TextEncoder().encode(String(value)).length <= 64;
}

function fileItemRows(repoId, items) {
  const rows = [];
  for (const item of items.slice(0, 30)) {
    const action = item.type === 'dir' ? 'tree' : 'blob';
    const callbackData = `${action}:${repoId}:${item.sha}`;
    if (!item.sha || !callbackFits(callbackData)) continue;
    rows.push([
      {
        text: `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`,
        callback_data: callbackData
      }
    ]);
  }
  return rows;
}

/**
 * Menu Router and UI Generator for Nexa Dev Bot.
 * Views never claim external service health unless that view was built from a live API response.
 */
export class MenuManager {
  constructor(githubService) {
    this.github = githubService;
  }

  getMainMenuView() {
    const text = `⚡ <b>Nexa Dev Bot | پنل مدیریت توسعه</b>
➖➖➖➖➖➖➖➖➖➖
یکی از بخش‌های زیر را انتخاب کنید.
اتصال GitHub هنگام باز کردن مخزن‌ها به‌صورت زنده بررسی می‌شود.`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📁 مخزن‌ها (پروژه‌ها)', callback_data: 'menu:repos' },
            { text: '📊 وضعیت سرویس', callback_data: 'menu:status' }
          ],
          [
            { text: '🔧 ابزارهای توسعه', callback_data: 'menu:tools' },
            { text: '⚙️ تنظیمات', callback_data: 'menu:settings' }
          ],
          [{ text: '🔐 امنیت', callback_data: 'menu:security' }]
        ]
      }
    };
  }

  async getReposListView() {
    const repos = await this.github.listRepositories();
    const text = `📁 <b>فهرست مخزن‌ها و پروژه‌ها</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها</code>
➖➖➖➖➖➖➖➖➖➖
این فهرست از GitHub API دریافت شده است. پروژه مورد نظر را انتخاب کنید:`;

    const inlineKeyboard = [];
    for (let i = 0; i < repos.length; i += 2) {
      const row = [];
      row.push({
        text: `${repos[i].private ? '🔒' : '🌐'} ${repos[i].name}`,
        callback_data: `repo:${repos[i].id}`
      });
      if (repos[i + 1]) {
        row.push({
          text: `${repos[i + 1].private ? '🔒' : '🌐'} ${repos[i + 1].name}`,
          callback_data: `repo:${repos[i + 1].id}`
        });
      }
      inlineKeyboard.push(row);
    }

    if (!repos.length) {
      inlineKeyboard.push([
        { text: '🔄 بررسی مجدد', callback_data: 'menu:repos' }
      ]);
    }
    inlineKeyboard.push([
      { text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }
    ]);

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  async getRepoDetailView(repoId) {
    const repo = await this.github.getRepository(repoId);
    const visibility = repo.private ? '🔒 خصوصی' : '🌐 عمومی';
    const archived = repo.archived ? '\n⚠️ وضعیت: آرشیوشده' : '';
    const description = repo.description
      ? `\n📝 ${escapeHtml(repo.description)}`
      : '';
    const text = `📦 <b>پروژه: ${escapeHtml(repo.name)}</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها &gt; ${escapeHtml(repo.name)}</code>
➖➖➖➖➖➖➖➖➖➖
👤 مخزن: <code>${escapeHtml(repo.fullName)}</code>
👁 دسترسی: ${visibility}
🌿 شاخه پیش‌فرض: <code>${escapeHtml(repo.defaultBranch)}</code>${archived}${description}

اطلاعات بالا از GitHub API دریافت شد. یک عملیات را انتخاب کنید:`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📂 فایل‌ها', callback_data: `files:${repoId}` },
            { text: '🔀 Pull Requestها', callback_data: `pr:${repoId}` }
          ],
          [
            { text: '📝 Commitها', callback_data: `commits:${repoId}` },
            { text: '📊 وضعیت / تست‌ها', callback_data: `status:${repoId}` }
          ],
          [{ text: '🔙 بازگشت به لیست پروژه‌ها', callback_data: 'menu:repos' }]
        ]
      }
    };
  }

  async getPullRequestsView(repoId) {
    const [repo, prs] = await Promise.all([
      this.github.getRepository(repoId),
      this.github.listPullRequests(repoId)
    ]);
    const prListText = prs.length
      ? prs
          .map((pr) => {
            const state = pr.merged
              ? '🟣 Merged'
              : pr.state === 'open'
                ? '🟢 Open'
                : '🔴 Closed';
            return `• <b>#${pr.number}</b> ${escapeHtml(pr.title)}\n  └ <i>${escapeHtml(pr.author)} | ${state}</i>`;
          })
          .join('\n\n')
      : '<i>Pull Requestی در پاسخ GitHub یافت نشد.</i>';

    const text = `🔀 <b>Pull Requestهای پروژه ${escapeHtml(repo.name)}</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها &gt; ${escapeHtml(repo.name)} &gt; 🔀 Pull Request</code>
➖➖➖➖➖➖➖➖➖➖
${prListText}`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 بروزرسانی', callback_data: `pr:${repoId}` },
            { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
          ]
        ]
      }
    };
  }

  async getCommitsView(repoId) {
    const [repo, commits] = await Promise.all([
      this.github.getRepository(repoId),
      this.github.listCommits(repoId)
    ]);
    const commitListText = commits.length
      ? commits
          .map(
            (c) =>
              `• <code>${escapeHtml(c.sha)}</code> - ${escapeHtml(c.message)}\n  └ <i>${escapeHtml(c.author)}${c.date ? ` | ${escapeHtml(c.date)}` : ''}</i>`
          )
          .join('\n\n')
      : '<i>کامیتی در پاسخ GitHub یافت نشد.</i>';

    const text = `📝 <b>آخرین Commitهای پروژه ${escapeHtml(repo.name)}</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها &gt; ${escapeHtml(repo.name)} &gt; 📝 Commitها</code>
➖➖➖➖➖➖➖➖➖➖
${commitListText}`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 بروزرسانی', callback_data: `commits:${repoId}` },
            { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
          ]
        ]
      }
    };
  }

  async getFilesView(repoId, subpath = '') {
    const [repo, files] = await Promise.all([
      this.github.getRepository(repoId),
      this.github.listFiles(repoId, subpath)
    ]);
    const visibleItems = files.slice(0, 30);
    const itemsText = visibleItems.length
      ? visibleItems
          .map((f) => {
            const icon = f.type === 'dir' ? '📁' : '📄';
            const size = f.type === 'file' && f.size ? ` (${f.size} B)` : '';
            return `${icon} <code>${escapeHtml(f.name)}</code>${size}`;
          })
          .join('\n')
      : '<i>پوشه خالی است.</i>';
    const omitted =
      files.length > visibleItems.length
        ? `\n\n<i>${files.length - visibleItems.length} مورد دیگر در این نما نمایش داده نشده است.</i>`
        : '';

    const text = `📂 <b>ساختار فایل‌های پروژه ${escapeHtml(repo.name)}</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها &gt; ${escapeHtml(repo.name)} &gt; 📂 فایل‌ها${subpath ? ` &gt; ${escapeHtml(subpath)}` : ''}</code>
➖➖➖➖➖➖➖➖➖➖
${itemsText}${omitted}`;

    const inlineKeyboard = fileItemRows(repoId, visibleItems);
    inlineKeyboard.push([
      {
        text: '🔄 بروزرسانی',
        callback_data: `files:${repoId}${subpath ? `:${subpath}` : ''}`
      },
      { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
    ]);

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  async getTreeView(repoId, sha) {
    const [repo, items] = await Promise.all([
      this.github.getRepository(repoId),
      this.github.listTree(repoId, sha)
    ]);
    const visibleItems = items.slice(0, 30);
    const itemsText = visibleItems.length
      ? visibleItems
          .map((item) => {
            const icon = item.type === 'dir' ? '📁' : '📄';
            const size =
              item.type === 'file' && item.size ? ` (${item.size} B)` : '';
            return `${icon} <code>${escapeHtml(item.name)}</code>${size}`;
          })
          .join('\n')
      : '<i>این پوشه خالی است.</i>';
    const omitted =
      items.length > visibleItems.length
        ? `\n\n<i>${items.length - visibleItems.length} مورد دیگر در این نما نمایش داده نشده است.</i>`
        : '';

    const text = `📁 <b>پوشه در ${escapeHtml(repo.name)}</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها &gt; ${escapeHtml(repo.name)} &gt; 📂 فایل‌ها &gt; پوشه</code>
➖➖➖➖➖➖➖➖➖➖
${itemsText}${omitted}`;

    const inlineKeyboard = fileItemRows(repoId, visibleItems);
    inlineKeyboard.push([
      { text: '🔙 ریشه فایل‌ها', callback_data: `files:${repoId}` },
      { text: '📦 پروژه', callback_data: `repo:${repoId}` }
    ]);

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  async getBlobView(repoId, sha) {
    const repo = await this.github.getRepository(repoId);
    const body =
      'محتوای فایل در پیام تلگرام ارسال نمی‌شود. از مسیر فایل‌ها، فایل را در Mini App باز کنید.';

    const text = `📄 <b>پیش‌نمایش فایل در ${escapeHtml(repo.name)}</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها &gt; ${escapeHtml(repo.name)} &gt; 📂 فایل‌ها &gt; فایل</code>
➖➖➖➖➖➖➖➖➖➖
${body}
Ref: <code>${escapeHtml(String(sha || '').slice(0, 10))}</code>`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔙 ریشه فایل‌ها', callback_data: `files:${repoId}` },
            { text: '📦 پروژه', callback_data: `repo:${repoId}` }
          ]
        ]
      }
    };
  }

  async getRepoStatusView(repoId) {
    const status = await this.github.getRepoStatus(repoId);
    const runsText = status.lastRuns.length
      ? status.lastRuns
          .map((r) => {
            const icon =
              r.conclusion === 'success'
                ? '✅'
                : r.conclusion === 'failure'
                  ? '❌'
                  : '⏳';
            return `• ${icon} <b>${escapeHtml(r.name)}</b>: ${escapeHtml(r.conclusion || r.status || 'unknown')}\n  └ <i>${escapeHtml(r.commit || '')}</i>`;
          })
          .join('\n')
      : '<i>Workflow runی در پاسخ GitHub یافت نشد.</i>';

    const label = status.repoName || repoId;
    const text = `📊 <b>وضعیت پایپ‌لاین ${escapeHtml(label)}</b>
<code>🏠 Nexa Dev &gt; 📁 مخزن‌ها &gt; ${escapeHtml(label)} &gt; 📊 وضعیت</code>
➖➖➖➖➖➖➖➖➖➖
شاخه پیش‌فرض: <code>${escapeHtml(status.defaultBranch)}</code>
آخرین نتایج GitHub Actions:

${runsText}`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 بروزرسانی', callback_data: `status:${repoId}` },
            { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
          ]
        ]
      }
    };
  }

  getServiceStatusView() {
    const text = `📊 <b>وضعیت سیستم و سرویس‌ها</b>
<code>🏠 Nexa Dev &gt; 📊 وضعیت سرویس</code>
➖➖➖➖➖➖➖➖➖➖
• <b>Cloudflare Worker:</b> این درخواست توسط Worker پاسخ داده شد.
• <b>Telegram Webhook:</b> secret و owner در مرز ورودی Worker enforce می‌شوند؛ مقادیر محرمانه نمایش داده نمی‌شوند.
• <b>GitHub API:</b> هنگام باز کردن مخزن‌ها و وضعیت پروژه به‌صورت زنده فراخوانی می‌شود.
• <b>CI/CD:</b> نتیجه هر مخزن از GitHub Actions خوانده می‌شود.

این صفحه SLA، latency یا سلامت سرویس خارجی را بدون اندازه‌گیری واقعی اعلام نمی‌کند.`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 بررسی مجدد', callback_data: 'menu:status' },
            { text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }
          ]
        ]
      }
    };
  }

  getToolsView() {
    const tools = DEFAULT_CONFIG.devTools
      .map((t) => `• <b>${t.title}</b>\n  └ <i>${t.desc}</i>`)
      .join('\n\n');
    const text = `🔧 <b>ابزارهای توسعه</b>
<code>🏠 Nexa Dev &gt; 🔧 ابزارهای توسعه</code>
➖➖➖➖➖➖➖➖➖➖
${tools}`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏓 بررسی مسیر داخلی', callback_data: 'tool:ping' }],
          [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }]
        ]
      }
    };
  }

  getSettingsView() {
    const text = `⚙️ <b>تنظیمات Nexa Dev</b>
<code>🏠 Nexa Dev &gt; ⚙️ تنظیمات</code>
➖➖➖➖➖➖➖➖➖➖
• مالک GitHub پیش‌فرض: <code>${escapeHtml(DEFAULT_CONFIG.defaultOwner)}</code>
• Runtime: <b>Cloudflare Worker</b>
• ناوبری: <b>Single-message / editMessageText</b>
• زبان رابط: <b>فارسی</b>

مقادیر Secret از این رابط نمایش داده نمی‌شوند.`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }]
        ]
      }
    };
  }

  getSecurityView() {
    const text = `🔐 <b>امنیت و دسترسی‌ها</b>
<code>🏠 Nexa Dev &gt; 🔐 امنیت</code>
➖➖➖➖➖➖➖➖➖➖
• Webhook secret: <b>اجباری در Worker</b>
• Owner-only access: <b>اجباری با OWNER_TELEGRAM_ID</b>
• Credentials: <b>خارج از مخزن و خارج از پیام‌های ربات</b>
• Diagnostic ID endpoint: <b>غیرفعال</b>

این صفحه وجود یا مقدار Secretهای runtime را افشا نمی‌کند.`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }]
        ]
      }
    };
  }

  async renderByCallback(callbackData) {
    const [action, target, ...extra] = String(callbackData || '').split(':');

    switch (action) {
      case 'menu':
        if (target === 'repos') return this.getReposListView();
        if (target === 'status') return this.getServiceStatusView();
        if (target === 'tools') return this.getToolsView();
        if (target === 'settings') return this.getSettingsView();
        if (target === 'security') return this.getSecurityView();
        return this.getMainMenuView();
      case 'repo':
        return this.getRepoDetailView(target);
      case 'pr':
        return this.getPullRequestsView(target);
      case 'commits':
        return this.getCommitsView(target);
      case 'files':
        return this.getFilesView(target, extra.join(':'));
      case 'tree':
        return this.getTreeView(target, extra[0]);
      case 'blob':
        return this.getBlobView(target, extra[0]);
      case 'status':
        return this.getRepoStatusView(target);
      case 'tool':
        if (target === 'ping') {
          return {
            text: '🏓 <b>Pong</b>\nمسیر داخلی ربات پاسخ داد. latency شبکه یا سلامت سرویس خارجی در این عملیات اندازه‌گیری نشده است.',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 بازگشت به ابزارها', callback_data: 'menu:tools' }]
              ]
            }
          };
        }
        return this.getToolsView();
      default:
        return this.getMainMenuView();
    }
  }
}
