import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GuideMenuManager } from '../src/guide-menu.js';
import { GuidedNexaDevBot } from '../src/guide-bot.js';

const github = {
  owner: 'davoodmehraban89',
  async listRepositories() {
    return [];
  },
  async getRepository(repo) {
    return {
      id: repo,
      name: String(repo),
      fullName: `davoodmehraban89/${repo}`,
      private: true,
      defaultBranch: 'main',
      archived: false
    };
  }
};

function callbacks(view) {
  return (view.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => button.callback_data)
    .filter(Boolean);
}

describe('Nexa Dev Bot - in-app V2.1 guide', () => {
  const menu = new GuideMenuManager(github);

  it('exposes Guide from the main inline menu', () => {
    const view = menu.getMainMenuView();
    assert.ok(callbacks(view).includes('menu:help'));
    assert.ok(
      view.reply_markup.inline_keyboard
        .flat()
        .some((button) => button.text.includes('راهنما'))
    );
  });

  it('guide index and pages identify V2.1 and expose all seven navigable chapters', async () => {
    const index = await menu.renderByCallback('menu:help');
    assert.match(index.text, /راهنمای Nexa Dev.*V2\.1/);
    const indexCallbacks = callbacks(index);
    for (const callback of [
      'help:1',
      'help:2',
      'help:3',
      'help:4',
      'help:5',
      'help:6',
      'help:7'
    ]) {
      assert.ok(indexCallbacks.includes(callback), `missing ${callback}`);
    }

    const menuHelp = await menu.renderByCallback('help:1');
    for (const label of [
      'منوی اصلی',
      'پروژه‌ها',
      'وضعیت',
      'ابزارها',
      'پیکربندی',
      'امنیت',
      'راهنما'
    ]) {
      assert.ok(menuHelp.text.includes(label), `menu guide missing ${label}`);
    }

    const repoHelp = await menu.renderByCallback('help:2');
    for (const label of [
      'فایل‌ها',
      'Pull Request',
      'Commit',
      'جزئیات Commit',
      'CI / Actions',
      'Branches',
      'Issues',
      'Releases',
      'جزئیات Issue',
      'Release notes'
    ]) {
      assert.ok(repoHelp.text.includes(label), `repo guide missing ${label}`);
    }

    const workspaceHelp = await menu.renderByCallback('help:3');
    for (const label of [
      'Edit',
      'Editor',
      'Mini App',
      'WORKSPACE_STORE',
      'پیام Commit',
      'Diff',
      'آماده Commit',
      'لغو Draft'
    ]) {
      assert.ok(
        workspaceHelp.text.includes(label),
        `workspace guide missing ${label}`
      );
    }
    assert.doesNotMatch(workspaceHelp.text, /Paste متن|بارگذاری فایل/);
    assert.match(workspaceHelp.text, /متن منبع.*چت.*ارسال نکنید/);

    const ciHelp = await menu.renderByCallback('help:5');
    for (const label of [
      'Job',
      'Artifacts',
      'log',
      'اجرای مجدد',
      'لغو Workflow',
      'بروزرسانی',
      'جدیدتر',
      'قدیمی‌تر'
    ]) {
      assert.ok(ciHelp.text.includes(label), `CI guide missing ${label}`);
    }
  });

  it('documents operational diagnostics, read-only configuration and Security Center controls', async () => {
    const menuHelp = await menu.renderByCallback('help:1');
    for (const label of [
      'خودآزمایی',
      'تست اتصال GitHub',
      'Runtime',
      'Plugin Registry',
      'پیکربندی',
      'فقط‌خواندنی'
    ]) {
      assert.ok(
        menuHelp.text.includes(label),
        `operational guide missing ${label}`
      );
    }

    const securityHelp = await menu.renderByCallback('help:6');
    for (const label of [
      'مرکز امنیت',
      'سیاست عملیات',
      'Safe Approval',
      'Replay',
      'Owner-only'
    ]) {
      assert.ok(
        securityHelp.text.includes(label),
        `security guide missing ${label}`
      );
    }
  });

  it('documents the complete file-edit flow from project selection through branch-only Safe Approval commit', async () => {
    const view = await menu.renderByCallback('help:4');
    const expected = [
      'پروژه‌ها',
      'فایل‌ها',
      'Edit',
      'Editor',
      'ذخیره Draft',
      'Diff',
      'پیام Commit',
      'آماده Commit',
      'Safe Approval',
      'تأیید و اجرا',
      'nexa/edit-',
      'main'
    ];
    for (const item of expected)
      assert.ok(view.text.includes(item), `file-edit guide missing ${item}`);
    assert.match(view.text, /main.*مستقیم.*تغییر|شاخه.*پیش.?فرض.*تغییر.*نمی/);
  });

  it('documents production, Cloudflare deployment, preview isolation and the public status boundary', async () => {
    const view = await menu.renderByCallback('help:7');
    for (const label of [
      'Production',
      'Cloudflare',
      'Deploy',
      'Preview',
      'Durable Object',
      '/status',
      'حداقلی',
      'Observability'
    ]) {
      assert.ok(view.text.includes(label), `production guide missing ${label}`);
    }
    assert.match(view.text, /داخل Telegram.*جزئیات|جزئیات.*داخل Telegram/);
  });

  it('keeps every guide page and callback within Telegram limits', async () => {
    const encoder = new TextEncoder();
    for (const callback of [
      'menu:help',
      'help:1',
      'help:2',
      'help:3',
      'help:4',
      'help:5',
      'help:6',
      'help:7'
    ]) {
      const view = await menu.renderByCallback(callback);
      assert.ok(
        view.text.length <= 4096,
        `${callback} exceeds Telegram message limit`
      );
      for (const value of callbacks(view)) {
        assert.ok(
          encoder.encode(value).length <= 64,
          `${value} exceeds Telegram callback limit`
        );
      }
    }
  });

  it('opens Studio from start while preserving old Guide text navigation', async () => {
    const bot = new GuidedNexaDevBot({ OWNER_TELEGRAM_ID: '1' });
    const sent = [];
    bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
      sent.push({ chatId, text, replyMarkup });
      return { ok: true };
    };
    bot.telegram.setChatMenuButton = async () => ({ ok: true });

    await bot.handleMessage({
      chat: { id: 1, type: 'private' },
      from: { id: 1 },
      text: '/start'
    });
    assert.deepEqual(sent[0].replyMarkup, { remove_keyboard: true });
    assert.deepEqual(sent[1].replyMarkup, {
      inline_keyboard: [
        [
          {
            text: 'باز کردن Nexa Studio',
            web_app: {
              url: 'https://nexa-dev-bot.davoodmehraban89.workers.dev/studio/'
            }
          }
        ]
      ]
    });

    sent.length = 0;
    await bot.handleMessage({
      chat: { id: 1 },
      from: { id: 1 },
      text: '📘 راهنما'
    });
    assert.match(sent[0].text, /راهنمای Nexa Dev.*V2\.1/);
  });

  it('keeps README aligned with the deployed V2.1 architecture', () => {
    const readme = readFileSync(
      new URL('../README.md', import.meta.url),
      'utf8'
    );
    for (const label of [
      'Workspace Editor',
      'WORKSPACE_STORE',
      'APPROVAL_REPLAY_GUARD',
      'Ops Console',
      'پیکربندی',
      'Worker Preview',
      'Mini App',
      '/status'
    ]) {
      assert.ok(readme.includes(label), `README missing ${label}`);
    }
    assert.doesNotMatch(readme, /ناوبری callback به‌صورت stateless/);
  });
});
