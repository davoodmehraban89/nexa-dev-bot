import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GitHubService } from '../src/github.js';
import { MenuManager } from '../src/menu.js';

describe('Nexa Dev Bot - MenuManager & State Navigation', () => {
  const github = new GitHubService();
  const menu = new MenuManager(github);

  it('1. Main Menu has correct sections and buttons', () => {
    const view = menu.getMainMenuView();
    assert.ok(view.text.includes('Nexa Dev Bot'));
    assert.ok(view.reply_markup?.inline_keyboard);
    
    const buttons = view.reply_markup.inline_keyboard.flat();
    const callbacks = buttons.map(b => b.callback_data);
    
    assert.ok(callbacks.includes('menu:repos'));
    assert.ok(callbacks.includes('menu:status'));
    assert.ok(callbacks.includes('menu:tools'));
    assert.ok(callbacks.includes('menu:settings'));
    assert.ok(callbacks.includes('menu:security'));
  });

  it('2. Repositories list displays projects and has back button to main', async () => {
    const view = await menu.getReposListView();
    assert.ok(view.text.includes('فهرست مخزن‌ها'));
    assert.ok(view.text.includes('Nexa Dev > 📁 مخزن‌ها'));

    const buttons = view.reply_markup.inline_keyboard.flat();
    const btnTexts = buttons.map(b => b.text);
    const callbacks = buttons.map(b => b.callback_data);

    assert.ok(btnTexts.some(t => t.includes('Factor-easy')));
    assert.ok(btnTexts.some(t => t.includes('Finora-Invoice')));
    assert.ok(callbacks.includes('repo:Factor-easy'));
    assert.ok(callbacks.includes('menu:main'), 'Should have back button to main menu');
  });

  it('3. Repository detail menu has sub-operations and back button to repos list', async () => {
    const view = await menu.getRepoDetailView('Factor-easy');
    assert.ok(view.text.includes('پروژه: Factor-easy'));
    assert.ok(view.text.includes('Nexa Dev > 📁 مخزن‌ها > Factor-easy'));

    const buttons = view.reply_markup.inline_keyboard.flat();
    const callbacks = buttons.map(b => b.callback_data);

    assert.ok(callbacks.includes('files:Factor-easy'));
    assert.ok(callbacks.includes('pr:Factor-easy'));
    assert.ok(callbacks.includes('commits:Factor-easy'));
    assert.ok(callbacks.includes('status:Factor-easy'));
    assert.ok(callbacks.includes('menu:repos'), 'Back button must return to repos list');
  });

  it('4. Pull Requests view renders all target PRs with back to repo detail', async () => {
    const view = await menu.getPullRequestsView('Factor-easy');
    assert.ok(view.text.includes('Pull Requestهای پروژه Factor-easy'));
    assert.ok(view.text.includes('#43'));
    assert.ok(view.text.includes('Ops: strengthen long-running execution heartbeat rule'));
    assert.ok(view.text.includes('#40'));
    assert.ok(view.text.includes('#39'));
    assert.ok(view.text.includes('#28'));
    assert.ok(view.text.includes('#6'));

    const buttons = view.reply_markup.inline_keyboard.flat();
    const callbacks = buttons.map(b => b.callback_data);
    assert.ok(callbacks.includes('repo:Factor-easy'), 'Back button must return to repo detail');
  });

  it('5. Commits view displays recent commits and back button', async () => {
    const view = await menu.getCommitsView('Factor-easy');
    assert.ok(view.text.includes('آخرین Commitهای پروژه Factor-easy'));
    assert.ok(view.text.includes('87b25b1'));

    const callbacks = view.reply_markup.inline_keyboard.flat().map(b => b.callback_data);
    assert.ok(callbacks.includes('repo:Factor-easy'));
  });

  it('6. Files view displays directory structure and back button', async () => {
    const view = await menu.getFilesView('Factor-easy');
    assert.ok(view.text.includes('ساختار فایل‌های پروژه Factor-easy'));
    assert.ok(view.text.includes('src'));

    const callbacks = view.reply_markup.inline_keyboard.flat().map(b => b.callback_data);
    assert.ok(callbacks.includes('repo:Factor-easy'));
  });

  it('7. Service status view displays infrastructure SLA and back button', () => {
    const view = menu.getServiceStatusView();
    assert.ok(view.text.includes('وضعیت سیستم و سرویس‌های فعال'));
    assert.ok(view.text.includes('Cloudflare Worker'));

    const callbacks = view.reply_markup.inline_keyboard.flat().map(b => b.callback_data);
    assert.ok(callbacks.includes('menu:main'));
  });

  it('8. renderByCallback handles dynamic routing and navigation hierarchy', async () => {
    const mainView = await menu.renderByCallback('menu:main');
    assert.ok(mainView.text.includes('Nexa Dev Bot'));

    const reposView = await menu.renderByCallback('menu:repos');
    assert.ok(reposView.text.includes('فهرست مخزن‌ها'));

    const repoView = await menu.renderByCallback('repo:Factor-easy');
    assert.ok(repoView.text.includes('پروژه: Factor-easy'));

    const prView = await menu.renderByCallback('pr:Factor-easy');
    assert.ok(prView.text.includes('Pull Requestهای پروژه Factor-easy'));

    const pingView = await menu.renderByCallback('tool:ping');
    assert.ok(pingView.text.includes('Pong!'));
  });
});
