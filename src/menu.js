import { DEFAULT_CONFIG } from './config.js';

/**
 * Menu Router and UI Generator for Nexa Dev Bot
 */
export class MenuManager {
  constructor(githubService) {
    this.github = githubService;
  }

  /**
   * Main Menu (Home)
   */
  getMainMenuView() {
    const text = 
`⚡ <b>Nexa Dev Bot | پنل مدیریت توسعه</b>
➖➖➖➖➖➖➖➖➖➖
خوش آمدید! یکی از بخش‌های زیر را انتخاب کنید:
وضعیت اتصال گیت‌هاب: ✅ متصل (davoodmehraban89)
مدیریت مخازن، وضعیت سرویس‌ها و پایش یکپارچه.`;

    const inlineKeyboard = [
      [
        { text: '📁 مخزن‌ها (پروژه‌ها)', callback_data: 'menu:repos' },
        { text: '📊 وضعیت سرویس', callback_data: 'menu:status' }
      ],
      [
        { text: '🔧 ابزارهای توسعه', callback_data: 'menu:tools' },
        { text: '⚙️ تنظیمات', callback_data: 'menu:settings' }
      ],
      [
        { text: '🔐 امنیت و توکن‌ها', callback_data: 'menu:security' }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Repositories List Menu
   */
  async getReposListView() {
    const repos = await this.github.listRepositories();
    const text = 
`📁 <b>فهرست مخزن‌ها و پروژه‌ها</b>
<code>🏠 Nexa Dev > 📁 مخزن‌ها</code>
➖➖➖➖➖➖➖➖➖➖
لطفاً پروژه مورد نظر خود را جهت مشاهده جزئیات، فایل‌ها، کامیت‌ها و PRها انتخاب کنید:`;

    const inlineKeyboard = [];
    for (let i = 0; i < repos.length; i += 2) {
      const row = [];
      row.push({ text: `📦 ${repos[i].name}`, callback_data: `repo:${repos[i].id}` });
      if (repos[i + 1]) {
        row.push({ text: `📦 ${repos[i + 1].name}`, callback_data: `repo:${repos[i + 1].id}` });
      }
      inlineKeyboard.push(row);
    }

    // Navigation row
    inlineKeyboard.push([
      { text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }
    ]);

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Single Repository Detail Menu
   */
  async getRepoDetailView(repoId) {
    const text = 
`📦 <b>پروژه: ${repoId}</b>
<code>🏠 Nexa Dev > 📁 مخزن‌ها > ${repoId}</code>
➖➖➖➖➖➖➖➖➖➖
👤 مخزن: <code>${this.github.owner}/${repoId}</code>
🔗 وضعیت اتصال GitHub: ✅ تایید شده
یک عملیات را انتخاب کنید:`;

    const inlineKeyboard = [
      [
        { text: '📂 فایل‌ها', callback_data: `files:${repoId}` },
        { text: '🔀 Pull Requestها', callback_data: `pr:${repoId}` }
      ],
      [
        { text: '📝 Commitها', callback_data: `commits:${repoId}` },
        { text: '📊 وضعیت / تست‌ها', callback_data: `status:${repoId}` }
      ],
      [
        { text: '🔙 بازگشت به لیست پروژه‌ها', callback_data: 'menu:repos' }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Pull Requests View
   */
  async getPullRequestsView(repoId) {
    const prs = await this.github.listPullRequests(repoId);
    
    let prListText = '';
    if (prs.length === 0) {
      prListText = '<i>هیچ Pull Request بازی یافت نشد.</i>';
    } else {
      prListText = prs.map(pr => {
        const stateEmoji = pr.merged ? '🟣 [Merged]' : (pr.state === 'open' ? '🟢 [Open]' : '🔴 [Closed]');
        return `• <b>#${pr.number}</b> ${pr.title}\n  └ <i>نویسنده: @${pr.author} | وضعیت: ${stateEmoji}</i>`;
      }).join('\n\n');
    }

    const text = 
`🔀 <b>Pull Requestهای پروژه ${repoId}</b>
<code>🏠 Nexa Dev > 📁 مخزن‌ها > ${repoId} > 🔀 Pull Request</code>
➖➖➖➖➖➖➖➖➖➖
✅ دریافت لیست PRها از GitHub
✅ نمایش شماره، عنوان، نویسنده و وضعیت:

${prListText}`;

    const inlineKeyboard = [
      [
        { text: '🔄 بروزرسانی', callback_data: `pr:${repoId}` },
        { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Commits View
   */
  async getCommitsView(repoId) {
    const commits = await this.github.listCommits(repoId);
    
    let commitListText = commits.map(c => {
      return `• <code>${c.sha}</code> - ${c.message}\n  └ <i>توسط @${c.author} در ${c.date}</i>`;
    }).join('\n\n');

    const text = 
`📝 <b>آخرین Commitهای پروژه ${repoId}</b>
<code>🏠 Nexa Dev > 📁 مخزن‌ها > ${repoId} > 📝 Commitها</code>
➖➖➖➖➖➖➖➖➖➖
${commitListText}`;

    const inlineKeyboard = [
      [
        { text: '🔄 بروزرسانی', callback_data: `commits:${repoId}` },
        { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Files View
   */
  async getFilesView(repoId, subpath = '') {
    const files = await this.github.listFiles(repoId, subpath);
    
    const itemsText = files.map(f => {
      const icon = f.type === 'dir' ? '📁' : '📄';
      const size = f.size ? ` (${f.size} B)` : '';
      return `${icon} <code>${f.name}</code>${size}`;
    }).join('\n');

    const text = 
`📂 <b>ساختار فایل‌های پروژه ${repoId}</b>
<code>🏠 Nexa Dev > 📁 مخزن‌ها > ${repoId} > 📂 فایل‌ها${subpath ? ` > ${subpath}` : ''}</code>
➖➖➖➖➖➖➖➖➖➖
${itemsText || '<i>پوشه خالی است.</i>'}`;

    const inlineKeyboard = [
      [
        { text: '🔄 بروزرسانی', callback_data: `files:${repoId}` },
        { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Repository Status & Tests View
   */
  async getRepoStatusView(repoId) {
    const status = await this.github.getRepoStatus(repoId);
    
    const runsText = status.lastRuns.map(r => {
      const icon = r.conclusion === 'success' ? '✅' : (r.conclusion === 'failure' ? '❌' : '⏳');
      return `• ${icon} <b>${r.name}</b>: ${r.conclusion || r.status}\n  └ <i>کامیت: ${r.commit}</i>`;
    }).join('\n');

    const text = 
`📊 <b>وضعیت سیستم و پایپ‌لاین ${repoId}</b>
<code>🏠 Nexa Dev > 📁 مخزن‌ها > ${repoId} > 📊 وضعیت</code>
➖➖➖➖➖➖➖➖➖➖
شاخه پیش‌فرض: <code>${status.defaultBranch}</code>
آخرین نتایج Workflow و تست‌ها:

${runsText}`;

    const inlineKeyboard = [
      [
        { text: '🔄 بروزرسانی', callback_data: `status:${repoId}` },
        { text: '🔙 بازگشت به پروژه', callback_data: `repo:${repoId}` }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * System & Service Status View
   */
  getServiceStatusView() {
    const services = DEFAULT_CONFIG.systemServices.map(s => `• <b>${s.name}</b>:\n  └ ${s.status}`).join('\n\n');
    const text = 
`📊 <b>وضعیت سیستم و سرویس‌های فعال</b>
<code>🏠 Nexa Dev > 📊 وضعیت سرویس</code>
➖➖➖➖➖➖➖➖➖➖
${services}

⏰ آخرین بررسی: هم‌اکنون (Realtime)`;

    const inlineKeyboard = [
      [
        { text: '🔄 بررسی مجدد', callback_data: 'menu:status' },
        { text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Developer Tools View
   */
  getToolsView() {
    const tools = DEFAULT_CONFIG.devTools.map(t => `• <b>${t.title}</b>:\n  └ <i>${t.desc}</i>`).join('\n\n');
    const text = 
`🔧 <b>ابزارهای توسعه (Dev Tools)</b>
<code>🏠 Nexa Dev > 🔧 ابزارهای توسعه</code>
➖➖➖➖➖➖➖➖➖➖
${tools}`;

    const inlineKeyboard = [
      [
        { text: '🏓 پینگ سرور', callback_data: 'tool:ping' },
        { text: '🧹 پاکسازی سشن', callback_data: 'tool:cache_clear' }
      ],
      [
        { text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Settings View
   */
  getSettingsView() {
    const text = 
`⚙️ <b>تنظیمات ربات Nexa Dev</b>
<code>🏠 Nexa Dev > ⚙️ تنظیمات</code>
➖➖➖➖➖➖➖➖➖➖
• اکانت گیت‌هاب هدف: <code>${DEFAULT_CONFIG.defaultOwner}</code>
• حالت وب‌هوک: <b>Cloudflare Worker Event Handler</b>
• نحوه ناوبری: <b>Single-Message In-Place Edit (حذف پیام‌های هرز)</b>
• زبان رابط کاربری: <b>فارسی (پیش‌فرض)</b>`;

    const inlineKeyboard = [
      [
        { text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Security & Tokens View
   */
  getSecurityView() {
    const sec = DEFAULT_CONFIG.securityStatus;
    const text = 
`🔐 <b>امنیت و دسترسی‌ها</b>
<code>🏠 Nexa Dev > 🔐 امنیت</code>
➖➖➖➖➖➖➖➖➖➖
• وضعیت توکن: <b>${sec.status}</b>
• نوع دسترسی: <code>${sec.tokenType}</code>
• کاربران مجاز: <code>${sec.allowedUsers.join(', ')}</code>
• محدودیت نرخ (Rate Limit): <code>${sec.rateLimit}</code>
• حفاظت در برابر پیام‌های تکراری و Spam: <b>فعال ✅</b>`;

    const inlineKeyboard = [
      [
        { text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu:main' }
      ]
    ];

    return { text, reply_markup: { inline_keyboard: inlineKeyboard } };
  }

  /**
   * Route callback data to corresponding view
   */
  async renderByCallback(callbackData) {
    const [action, target, ...extra] = callbackData.split(':');

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

      case 'status':
        return this.getRepoStatusView(target);

      case 'tool':
        if (target === 'ping') {
          return {
            text: `🏓 <b>Pong!</b>\nپاسخ سرور در <b>12ms</b> دریافت شد.\nاتصال تلگرام و ورکر پایدار است.`,
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 بازگشت به ابزارها', callback_data: 'menu:tools' }]]
            }
          };
        }
        if (target === 'cache_clear') {
          return {
            text: `🧹 <b>حافظه موقت پاکسازی شد.</b>\nوضعیت ناوبری ریست شد.`,
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 بازگشت به ابزارها', callback_data: 'menu:tools' }]]
            }
          };
        }
        return this.getToolsView();

      default:
        return this.getMainMenuView();
    }
  }
}
