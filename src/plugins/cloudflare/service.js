const API_BASE = 'https://api.cloudflare.com/client/v4';

const clean = (value) => String(value ?? '').trim();
const safe = (value) => encodeURIComponent(clean(value));

function redact(message, token) {
  const text = String(message || 'Cloudflare request failed');
  return token ? text.split(token).join('[REDACTED]') : text;
}

function firstError(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return errors
    .map((item) => item?.message)
    .filter(Boolean)
    .join('; ');
}

export class CloudflareService {
  constructor({
    token = '',
    accountId = '',
    workerName = '',
    fetchImpl = globalThis.fetch
  } = {}) {
    this.token = clean(token);
    this.accountId = clean(accountId);
    this.workerName = clean(workerName);
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(
      this.token &&
        this.accountId &&
        this.workerName &&
        typeof this.fetchImpl === 'function'
    );
  }

  requireConfigured() {
    if (!this.isConfigured())
      throw new Error('Cloudflare provider is not configured');
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  endpoint(suffix) {
    return `${API_BASE}/accounts/${safe(this.accountId)}/workers/scripts/${safe(this.workerName)}${suffix}`;
  }

  async requestJson(suffix, label, { method = 'GET', body } = {}) {
    this.requireConfigured();
    let response;
    try {
      const options = { method, headers: this.headers };
      if (body !== undefined) options.body = JSON.stringify(body);
      response = await this.fetchImpl(this.endpoint(suffix), options);
    } catch (error) {
      throw new Error(
        redact(`${label} failed: ${error?.message || error}`, this.token)
      );
    }

    let raw = '';
    try {
      raw = await response.text();
    } catch {
      raw = '';
    }

    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }

    if (!response.ok || payload?.success === false) {
      const detail =
        firstError(payload) || raw.slice(0, 240) || 'request failed';
      throw new Error(
        redact(`${label} failed: ${response.status} ${detail}`, this.token)
      );
    }

    if (payload === null)
      throw new Error(`${label} failed: invalid JSON response`);
    return payload?.result ?? payload;
  }

  async listVersions() {
    const result = await this.requestJson('/versions', 'Cloudflare versions');
    const items = Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result)
        ? result
        : [];
    return items
      .slice(0, 20)
      .map((item) => ({
        id: clean(item?.id),
        createdOn: clean(item?.created_on),
        triggeredBy: clean(item?.annotations?.['workers/triggered_by'])
      }))
      .filter((item) => item.id);
  }

  async listDeployments() {
    const result = await this.requestJson(
      '/deployments',
      'Cloudflare deployments'
    );
    const items = Array.isArray(result?.deployments)
      ? result.deployments
      : Array.isArray(result)
        ? result
        : [];
    return items.slice(0, 20).map((item) => ({
      id: clean(item?.id),
      createdOn: clean(item?.created_on),
      versions: (Array.isArray(item?.versions) ? item.versions : []).map(
        (version) => ({
          versionId: clean(version?.version_id),
          percentage: Number.isFinite(Number(version?.percentage))
            ? Number(version.percentage)
            : 0
        })
      )
    }));
  }

  async deployVersion(versionId) {
    const target = clean(versionId);
    if (!/^[0-9a-f-]{36}$/i.test(target))
      throw new Error('Cloudflare version ID is invalid');
    const versions = await this.listVersions();
    if (!versions.some((version) => version.id === target))
      throw new Error('Cloudflare version is not known');
    await this.requestJson('/deployments', 'Cloudflare deploy version', {
      method: 'POST',
      body: {
        strategy: 'percentage',
        versions: [{ percentage: 100, version_id: target }]
      }
    });
    const snapshot = await this.getWorkerSnapshot();
    const active = snapshot.deployment?.versions || [];
    if (
      active.length !== 1 ||
      active[0].versionId !== target ||
      Number(active[0].percentage) !== 100
    ) {
      throw new Error('Cloudflare deployment verification failed');
    }
    return {
      versionId: target,
      deploymentId: snapshot.deployment?.id || '',
      verified: true
    };
  }

  async getWorkerSnapshot() {
    this.requireConfigured();
    const [deploymentsResult, versionsResult, settingsResult] =
      await Promise.all([
        this.requestJson('/deployments', 'Cloudflare deployments'),
        this.requestJson('/versions', 'Cloudflare versions'),
        this.requestJson('/settings', 'Cloudflare settings')
      ]);

    const deployments = Array.isArray(deploymentsResult?.deployments)
      ? deploymentsResult.deployments
      : Array.isArray(deploymentsResult)
        ? deploymentsResult
        : [];
    const versions = Array.isArray(versionsResult?.items)
      ? versionsResult.items
      : Array.isArray(versionsResult)
        ? versionsResult
        : [];

    const latestDeployment = deployments[0] || null;
    const traffic = Array.isArray(latestDeployment?.versions)
      ? latestDeployment.versions
      : [];
    const activeVersionId =
      traffic.length === 1 && Number(traffic[0]?.percentage) === 100
        ? clean(traffic[0]?.version_id)
        : '';
    let activeVersion = activeVersionId
      ? versions.find((version) => clean(version?.id) === activeVersionId)
      : null;
    // The versions list can omit annotations or the deployed version itself.
    // Read that exact version's detail; an unrelated latest upload is no proof.
    if (
      activeVersionId &&
      activeVersion?.annotations?.['workers/commit_sha'] === undefined &&
      activeVersion?.annotations?.['workers/tag'] === undefined
    ) {
      const detail = await this.requestJson(
        `/versions/${safe(activeVersionId)}`,
        'Cloudflare active version'
      );
      activeVersion = clean(detail?.id) === activeVersionId ? detail : null;
    }
    const bindings = Array.isArray(settingsResult?.bindings)
      ? settingsResult.bindings
          .map((binding) => ({
            name: clean(binding?.name),
            type: clean(binding?.type)
          }))
          .filter((binding) => binding.name || binding.type)
      : [];
    const observability = settingsResult?.observability || {};

    return {
      workerName: this.workerName,
      deployment: latestDeployment
        ? {
            id: clean(latestDeployment.id),
            createdOn: clean(latestDeployment.created_on),
            versions: (Array.isArray(latestDeployment.versions)
              ? latestDeployment.versions
              : []
            ).map((item) => ({
              versionId: clean(item?.version_id),
              percentage: Number.isFinite(Number(item?.percentage))
                ? Number(item.percentage)
                : 0
            }))
          }
        : null,
      version: activeVersion
        ? {
            id: clean(activeVersion.id),
            createdOn: clean(
              activeVersion.metadata?.created_on || activeVersion.created_on
            ),
            triggeredBy: clean(
              activeVersion.annotations?.['workers/triggered_by']
            ),
            annotations: Object.fromEntries(
              ['workers/commit_sha', 'workers/tag']
                .filter(
                  (key) => typeof activeVersion.annotations?.[key] === 'string'
                )
                .map((key) => [key, activeVersion.annotations[key]])
            )
          }
        : null,
      bindings,
      observability: {
        enabled: observability.enabled === true,
        logsEnabled: observability.logs?.enabled === true,
        invocationLogs: observability.logs?.invocation_logs === true,
        tracesEnabled: observability.traces?.enabled === true
      }
    };
  }
}
