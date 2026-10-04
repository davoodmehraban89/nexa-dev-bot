const configured = value => Boolean(String(value || '').trim());

function safeConfigured(checkable) {
  try {
    return Boolean(checkable?.isConfigured?.());
  } catch {
    return false;
  }
}

function pluginStats(registry) {
  let plugins = [];
  try {
    plugins = registry?.getPlugins?.() || [];
  } catch {
    plugins = [];
  }

  let actionCount = 0;
  const summary = plugins.map(plugin => {
    const manifest = plugin?.manifest || {};
    const actions = Object.entries(manifest.actions || {});
    actionCount += actions.length;
    const riskCounts = { READ: 0, WRITE: 0, DESTRUCTIVE: 0 };
    for (const [, descriptor] of actions) {
      const risk = descriptor?.risk;
      if (risk in riskCounts) riskCounts[risk] += 1;
    }
    return {
      id: String(manifest.id || 'unknown'),
      actionCount: actions.length,
      risks: riskCounts
    };
  });

  return { pluginCount: plugins.length, actionCount, plugins: summary };
}

export class RuntimeDiagnostics {
  constructor({ env = {}, github = null, registry = null, replayStore = null, workspaceStore = null, approvals = null } = {}) {
    this.env = env || {};
    this.github = github;
    this.registry = registry;
    this.replayStore = replayStore;
    this.workspaceStore = workspaceStore;
    this.approvals = approvals;
  }

  redact(value) {
    let text = String(value ?? '');
    const secrets = [
      this.env.TELEGRAM_BOT_TOKEN,
      this.env.TELEGRAM_WEBHOOK_SECRET,
      this.env.GITHUB_TOKEN,
      this.env.APPROVAL_SIGNING_SECRET
    ].map(secret => String(secret || '')).filter(Boolean);
    for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
    return text;
  }

  getPluginSummary() {
    return pluginStats(this.registry);
  }

  getSnapshot() {
    const plugins = this.getPluginSummary();
    let replayProtected = false;
    try {
      replayProtected = Boolean(this.approvals?.isReplayProtected?.());
    } catch {
      replayProtected = false;
    }

    return {
      runtime: 'Cloudflare Worker',
      githubOwner: String(this.env.GITHUB_OWNER || this.github?.owner || 'davoodmehraban89'),
      telegramConfigured: configured(this.env.TELEGRAM_BOT_TOKEN),
      webhookSecretConfigured: configured(this.env.TELEGRAM_WEBHOOK_SECRET),
      ownerConfigured: configured(this.env.OWNER_TELEGRAM_ID),
      githubConfigured: configured(this.env.GITHUB_TOKEN),
      replayGuardConfigured: safeConfigured(this.replayStore) || replayProtected,
      workspaceStoreConfigured: safeConfigured(this.workspaceStore),
      approvalSignerConfigured: configured(this.env.APPROVAL_SIGNING_SECRET) || configured(this.env.TELEGRAM_WEBHOOK_SECRET),
      dedicatedApprovalSignerConfigured: configured(this.env.APPROVAL_SIGNING_SECRET),
      pluginCount: plugins.pluginCount,
      actionCount: plugins.actionCount
    };
  }

  async probeGitHub() {
    if (!configured(this.env.GITHUB_TOKEN)) {
      return { ok: false, owner: String(this.github?.owner || this.env.GITHUB_OWNER || ''), error: 'GitHub token is not configured' };
    }
    if (!this.github || typeof this.github.listRepositories !== 'function') {
      return { ok: false, owner: String(this.github?.owner || this.env.GITHUB_OWNER || ''), error: 'GitHub provider is unavailable' };
    }

    try {
      const repositories = await this.github.listRepositories();
      return {
        ok: true,
        owner: String(this.github.owner || this.env.GITHUB_OWNER || ''),
        repositoryCount: Array.isArray(repositories) ? repositories.length : 0
      };
    } catch (error) {
      return {
        ok: false,
        owner: String(this.github?.owner || this.env.GITHUB_OWNER || ''),
        error: this.redact(error?.message || 'GitHub probe failed')
      };
    }
  }

  async runSelfCheck() {
    const snapshot = this.getSnapshot();
    const githubLive = await this.probeGitHub();
    const checks = [
      { id: 'telegram', label: 'Telegram Bot token', ok: snapshot.telegramConfigured },
      { id: 'webhook', label: 'Telegram Webhook secret', ok: snapshot.webhookSecretConfigured },
      { id: 'owner', label: 'Owner lock', ok: snapshot.ownerConfigured },
      { id: 'github-token', label: 'GitHub credential', ok: snapshot.githubConfigured },
      { id: 'replay-guard', label: 'Approval replay guard', ok: snapshot.replayGuardConfigured },
      { id: 'workspace-store', label: 'Workspace store', ok: snapshot.workspaceStoreConfigured },
      { id: 'approval-signer', label: 'Approval signer', ok: snapshot.approvalSignerConfigured },
      {
        id: 'github-live',
        label: 'GitHub live READ',
        ok: githubLive.ok,
        detail: githubLive.ok ? `${githubLive.repositoryCount} repositories visible` : githubLive.error
      }
    ];

    return {
      ok: checks.every(check => check.ok),
      checks,
      snapshot,
      github: githubLive
    };
  }
}
