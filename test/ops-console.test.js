import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeDiagnostics } from '../src/core/runtime-diagnostics.js';

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

describe('Nexa Dev Bot - operational diagnostics', () => {
  it('reports configuration presence and plugin counts without exposing secret values', () => {
    const env = {
      TELEGRAM_BOT_TOKEN: 'tg-secret-value',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-value',
      GITHUB_TOKEN: 'github-secret-value',
      OWNER_TELEGRAM_ID: '123',
      APPROVAL_SIGNING_SECRET: 'approval-secret-value',
      GITHUB_OWNER: 'davoodmehraban89'
    };
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
    const success = new RuntimeDiagnostics({
      env: { GITHUB_TOKEN: 'configured' },
      github: {
        owner: 'davoodmehraban89',
        async listRepositories() {
          return [{ id: 1 }, { id: 2 }];
        }
      },
      registry: fakeRegistry()
    });
    assert.deepEqual(await success.probeGitHub(), {
      ok: true,
      owner: 'davoodmehraban89',
      repositoryCount: 2
    });

    const failed = new RuntimeDiagnostics({
      env: { GITHUB_TOKEN: 'configured' },
      github: {
        owner: 'davoodmehraban89',
        async listRepositories() {
          throw new Error('GitHub 403 permission denied');
        }
      },
      registry: fakeRegistry()
    });
    const failure = await failed.probeGitHub();
    assert.equal(failure.ok, false);
    assert.match(failure.error, /403/);
    assert.doesNotMatch(failure.error, /configured/);
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
