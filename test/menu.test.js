import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MenuManager } from '../src/menu.js';

const github = {
  owner: 'davoodmehraban89',
  async listRepositories() {
    return [
      { id: 'Factor-easy', name: 'Factor-easy', private: true },
      { id: 'nexa-dev-bot', name: 'nexa-dev-bot', private: true }
    ];
  },
  async getRepository(repo) {
    return {
      id: repo,
      name: repo,
      fullName: `davoodmehraban89/${repo}`,
      private: true,
      description: 'Repository description',
      defaultBranch: 'main',
      archived: false
    };
  },
  async listPullRequests() {
    return [
      {
        number: 43,
        title: 'Ops: strengthen long-running execution heartbeat rule',
        author: 'davoodmehraban89',
        state: 'open',
        merged: false
      }
    ];
  },
  async listCommits() {
    return [
      {
        sha: '87b25b1',
        message: 'feat: mobile GitHub repository browser UX',
        author: 'davoodmehraban89',
        date: '2026-10-02'
      }
    ];
  },
  async listFiles() {
    return [{ name: 'src', path: 'src', type: 'dir', size: 0 }];
  },
  async getRepoStatus() {
    return {
      defaultBranch: 'main',
      lastRuns: [
        {
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          commit: 'fix mobile menu'
        }
      ]
    };
  }
};

describe('Nexa Dev Bot - MenuManager & Navigation', () => {
  const menu = new MenuManager(github);

  it('main menu exposes the required top-level sections without claiming an unverified GitHub connection', () => {
    const view = menu.getMainMenuView();
    assert.ok(view.text.includes('Nexa Dev Bot'));
    assert.doesNotMatch(view.text, /✅\s*متصل|تایید شده/);

    const callbacks = view.reply_markup.inline_keyboard
      .flat()
      .map((b) => b.callback_data);
    assert.ok(callbacks.includes('menu:repos'));
    assert.ok(callbacks.includes('menu:status'));
    assert.ok(callbacks.includes('menu:tools'));
    assert.ok(callbacks.includes('menu:settings'));
    assert.ok(callbacks.includes('menu:security'));
  });

  it('repositories list renders discovered projects and a back button', async () => {
    const view = await menu.getReposListView();
    assert.ok(view.text.includes('فهرست مخزن‌ها'));
    const buttons = view.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((b) => b.text.includes('Factor-easy')));
    assert.ok(buttons.some((b) => b.callback_data === 'repo:Factor-easy'));
    assert.ok(buttons.some((b) => b.callback_data === 'menu:main'));
  });

  it('repository detail is based on live repository metadata', async () => {
    const view = await menu.getRepoDetailView('Factor-easy');
    assert.ok(view.text.includes('davoodmehraban89/Factor-easy'));
    assert.ok(view.text.includes('main'));
    assert.ok(view.text.includes('خصوصی'));
    assert.doesNotMatch(view.text, /اتصال GitHub: ✅ تایید شده/);

    const callbacks = view.reply_markup.inline_keyboard
      .flat()
      .map((b) => b.callback_data);
    assert.ok(callbacks.includes('files:Factor-easy'));
    assert.ok(callbacks.includes('pr:Factor-easy'));
    assert.ok(callbacks.includes('commits:Factor-easy'));
    assert.ok(callbacks.includes('status:Factor-easy'));
    assert.ok(callbacks.includes('menu:repos'));
  });

  it('pull requests, commits, files and workflow status render source-backed data', async () => {
    const prView = await menu.getPullRequestsView('Factor-easy');
    assert.ok(prView.text.includes('#43'));
    assert.ok(
      prView.text.includes(
        'Ops: strengthen long-running execution heartbeat rule'
      )
    );

    const commitsView = await menu.getCommitsView('Factor-easy');
    assert.ok(commitsView.text.includes('87b25b1'));

    const filesView = await menu.getFilesView('Factor-easy');
    assert.ok(filesView.text.includes('src'));

    const statusView = await menu.getRepoStatusView('Factor-easy');
    assert.ok(statusView.text.includes('CI'));
    assert.ok(statusView.text.includes('main'));
  });

  it('service, tools and security views do not fabricate measurements or SLA claims', async () => {
    const serviceView = menu.getServiceStatusView();
    assert.doesNotMatch(serviceView.text, /100% SLA|Realtime/i);

    const pingView = await menu.renderByCallback('tool:ping');
    assert.doesNotMatch(pingView.text, /12ms|پایدار است/);

    const securityView = menu.getSecurityView();
    assert.doesNotMatch(
      securityView.text,
      /5000 req\/hr|فعال و ایمن|Fine-grained Personal Access Token/i
    );
  });

  it('callback router preserves hierarchical back navigation', async () => {
    const mainView = await menu.renderByCallback('menu:main');
    assert.ok(mainView.text.includes('Nexa Dev Bot'));

    const repoView = await menu.renderByCallback('repo:Factor-easy');
    assert.ok(repoView.text.includes('Factor-easy'));

    const prView = await menu.renderByCallback('pr:Factor-easy');
    assert.ok(prView.text.includes('Pull Request'));

    const backCallbacks = prView.reply_markup.inline_keyboard
      .flat()
      .map((b) => b.callback_data);
    assert.ok(backCallbacks.includes('repo:Factor-easy'));
  });
});
