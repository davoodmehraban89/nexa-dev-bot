import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeDiagnostics } from '../src/core/runtime-diagnostics.js';
import { OpsMenuManager } from '../src/ops-menu.js';

function fakeRegistry() {
  return {
    getPlugins() {
      return [{
        manifest: {
          id: 'github',
          actions: {
            'github.repos.list': { risk: 'READ' },
            'github.workspace.commit_branch': { risk: 'WRITE' }
          }
        }
      }];
    }
  };
}

function fullEnv() {
  return {
    TELEGRAM_BOT_TOKEN: 'tg-secret-value',
    TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-value',
    GITHUB_TOKEN: 'github-secret-value',
    OWNER_TELEGRAM_ID: '123',
    APPROVAL_SIGNING_SECRET: 'approval-secret-value',
    GITHUB_OWNER: 'davoodmehraban89'
  };
}

function diagnosticsForMenus({ githubFailure = false } = {}) {
  const github = {
    owner: 'davoodmehraban89',
    async listRepositories() {
      if (githubFailure) throw new Error('GitHub 403 permission denied');
      return [{ id: 1 }, { id: 2 }];
    }
  };
  const diagnostics = new RuntimeDiagnostics({
    env: fullEnv(),
    github,
    registry: fakeRegistry(),
    replayStore: { isConfigured: () => true },
    workspaceStore: { isConfigured: () => true },
    approvals: { isReplayProtected: () => true }
  });
  return { github, diagnostics };
}

function callbacks(view) {
  return (view.reply_markup?.inline_keyboard || []).flat().map(button => button.callback_data).filter(Boolean);
}

describe('Nexa Dev Bot - operational diagnostics', () => {
  it('reports configuration presence and plugin counts without exposing secret values', () => {
    const env = fullEnv();
    const diagnostics = new RuntimeDiagnostics({
      env,
      github: { owner: 'davoodmehraban89' },
      registry: fakeRegistry(),
      replayStore: { isConfigured: () => true },
      workspaceStore: { isConfigured: () => true },
      approvals: { isReplayProtected: () => true }
    });

    const snapshot = diagnostics.getSnapshot();
    assert.equal(snapshot.telegramConfigured, true);
    assert.equal(snapshot.webhookSecretConfigured, true);
    assert.equal(snapshot.ownerConfigured, true);
    assert.equal(snapshot.githubConfigured, true);
    assert.equal(snapshot.replayGuardConfigured, true);
    assert.equal(snapshot.workspaceStoreConfigured, true);
    assert.equal(snapshot.approvalSignerConfigured, true);
    assert.equal(snapshot.githubOwner, 'davoodmehraban89');
    assert.equal(snapshot.pluginCount, 1);
    assert.equal(snapshot.actionCount, 2);

    const serialized = JSON.stringify(snapshot);
    for (const secret of Object.values(env).filter(value => String(value).includes('secret'))) {
      assert.ok(!serialized.includes(secret), `snapshot leaked ${secret}`);
    }
  });

  it('performs a bounded live GitHub READ probe and reports provider failure explicitly', async () => {
    const success = diagnosticsForMenus().diagnostics;
    assert.deepEqual(await success.probeGitHub(), {
      ok: true,
      owner: 'davoodmehraban89',
      repositoryCount: 2
    });

    const failed = diagnosticsForMenus({ githubFailure: true }).diagnostics;
    const failure = await failed.probeGitHub();
    assert.equal(failure.ok, false);
    assert.match(failure.error, /403/);
    assert.doesNotMatch(failure.error, /github-secret-value/);
  });

  it('self-check is fail-closed when required bindings are missing', async () => {
    const diagnostics = new RuntimeDiagnostics({
      env: {},
      github: {
        owner: 'davoodmehraban89',
        async listRepositories() { throw new Error('GITHUB_TOKEN is missing'); }
      },
      registry: fakeRegistry(),
      replayStore: { isConfigured: () => false },
      workspaceStore: { isConfigured: () => false },
      approvals: { isReplayProtected: () => false }
    });

    const report = await diagnostics.runSelfCheck();
    assert.equal(report.ok, false);
    const byId = Object.fromEntries(report.checks.map(check => [check.id, check]));
    for (const id of ['telegram', 'webhook', 'owner', 'github-token', 'replay-guard', 'workspace-store', 'approval-signer', 'github-live']) {
      assert.equal(byId[id]?.ok, false, `${id} should fail closed`);
    }
  });
});

describe('Nexa Dev Bot - operational menu surfaces', () => {
  it('turns Development Tools into useful READ-only diagnostics', async () => {
    const { github, diagnostics } = diagnosticsForMenus();
    const menu = new OpsMenuManager(github, diagnostics);
    const view = menu.getToolsView();
    const values = callbacks(view);
    for (const callback of ['ops:selfcheck', 'ops:github', 'ops:runtime', 'ops:plugins', 'tool:ping']) {
      assert.ok(values.includes(callback), `missing ${callback}`);
    }
    assert.match(view.text, /تشخیص|Diagnostics|عیب.?یابی/);
  });

  it('renders source-backed live service status and explicit provider failure', async () => {
    const okContext = diagnosticsForMenus();
    const okMenu = new OpsMenuManager(okContext.github, okContext.diagnostics);
    const okView = await okMenu.getServiceStatusView();
    assert.match(okView.text, /GitHub.*✅|✅.*GitHub/s);
    assert.match(okView.text, /2/);
    assert.match(okView.text, /Workspace|Durable/);
    assert.doesNotMatch(okView.text, /99\.9|100% SLA|ms latency/i);

    const badContext = diagnosticsForMenus({ githubFailure: true });
    const badMenu = new OpsMenuManager(badContext.github, badContext.diagnostics);
    const badView = await badMenu.getServiceStatusView();
    assert.match(badView.text, /GitHub.*❌|❌.*GitHub/s);
    assert.match(badView.text, /403/);
  });

  it('provides a real Security Center and read-only Configuration Center', async () => {
    const { github, diagnostics } = diagnosticsForMenus();
    const menu = new OpsMenuManager(github, diagnostics);

    const security = menu.getSecurityView();
    for (const callback of ['security:selfcheck', 'security:policy', 'security:approval']) {
      assert.ok(callbacks(security).includes(callback), `missing ${callback}`);
    }
    assert.match(security.text, /مرکز امنیت/);

    const config = menu.getSettingsView();
    assert.match(config.text, /پیکربندی/);
    assert.doesNotMatch(config.text, /تنظیمات Nexa Dev/);
    for (const callback of ['config:runtime', 'config:providers', 'config:editor', 'config:plugins']) {
      assert.ok(callbacks(config).includes(callback), `missing ${callback}`);
    }
  });

  it('routes every operational drill-down and keeps Telegram payloads bounded', async () => {
    const { github, diagnostics } = diagnosticsForMenus();
    const menu = new OpsMenuManager(github, diagnostics);
    const encoder = new TextEncoder();
    const routes = [
      'menu:status', 'menu:tools', 'menu:security', 'menu:settings',
      'ops:selfcheck', 'ops:github', 'ops:runtime', 'ops:plugins',
      'security:selfcheck', 'security:policy', 'security:approval',
      'config:runtime', 'config:providers', 'config:editor', 'config:plugins'
    ];

    for (const route of routes) {
      const view = await menu.renderByCallback(route);
      assert.ok(view?.text, `${route} returned no text`);
      assert.ok(view.text.length <= 4096, `${route} exceeds Telegram message limit`);
      for (const callback of callbacks(view)) {
        assert.ok(encoder.encode(callback).length <= 64, `${callback} exceeds callback limit`);
      }
    }
  });

  it('never renders configured secrets in operational pages', async () => {
    const { github, diagnostics } = diagnosticsForMenus();
    const menu = new OpsMenuManager(github, diagnostics);
    const pages = await Promise.all([
      menu.getServiceStatusView(),
      menu.renderByCallback('ops:selfcheck'),
      menu.renderByCallback('ops:runtime'),
      menu.renderByCallback('security:selfcheck'),
      menu.renderByCallback('config:providers')
    ]);
    const combined = pages.map(page => page.text).join('\n');
    for (const secret of ['tg-secret-value', 'webhook-secret-value', 'github-secret-value', 'approval-secret-value']) {
      assert.ok(!combined.includes(secret), `operational page leaked ${secret}`);
    }
  });
});
