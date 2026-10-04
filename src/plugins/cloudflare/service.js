const API_BASE = 'https://api.cloudflare.com/client/v4';

const clean = value => String(value ?? '').trim();
const safe = value => encodeURIComponent(clean(value));

function redact(message, token) {
  const text = String(message || 'Cloudflare request failed');
  return token ? text.split(token).join('[REDACTED]') : text;
}

function firstError(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return errors.map(item => item?.message).filter(Boolean).join('; ');
}

export class CloudflareService {
  constructor({ token = '', accountId = '', workerName = '', fetchImpl = globalThis.fetch } = {}) {
    this.token = clean(token);
    this.accountId = clean(accountId);
    this.workerName = clean(workerName);
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.token && this.accountId && this.workerName && typeof this.fetchImpl === 'function');
  }

  requireConfigured() {
    if (!this.isConfigured()) throw new Error('Cloudflare provider is not configured');
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

  async requestJson(suffix, label) {
    this.requireConfigured();
    let response;
    try {
      response = await this.fetchImpl(this.endpoint(suffix), { method: 'GET', headers: this.headers });
    } catch (error) {
      throw new Error(redact(`${label} failed: ${error?.message || error}`, this.token));
    }

    let raw = '';
    try {
      raw = await response.text();
    } catch {
      raw = '';
    }

    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = null; }
    }

    if (!response.ok || payload?.success === false) {
      const detail = firstError(payload) || raw.slice(0, 240) || 'request failed';
      throw new Error(redact(`${label} failed: ${response.status} ${detail}`, this.token));
    }

    if (payload === null) throw new Error(`${label} failed: invalid JSON response`);
    return payload?.result ?? payload;
  }

  async getWorkerSnapshot() {
    this.requireConfigured();
    const [deploymentsResult, versionsResult, settingsResult] = await Promise.all([
      this.requestJson('/deployments', 'Cloudflare deployments'),
      this.requestJson('/versions', 'Cloudflare versions'),
      this.requestJson('/settings', 'Cloudflare settings')
    ]);

    const deployments = Array.isArray(deploymentsResult?.deployments)
      ? deploymentsResult.deployments
      : Array.isArray(deploymentsResult) ? deploymentsResult : [];
    const versions = Array.isArray(versionsResult?.items)
      ? versionsResult.items
      : Array.isArray(versionsResult) ? versionsResult : [];

    const latestDeployment = deployments[0] || null;
    const latestVersion = versions[0] || null;
    const bindings = Array.isArray(settingsResult?.bindings)
      ? settingsResult.bindings
          .map(binding => ({ name: clean(binding?.name), type: clean(binding?.type) }))
          .filter(binding => binding.name || binding.type)
      : [];
    const observability = settingsResult?.observability || {};

    return {
      workerName: this.workerName,
      deployment: latestDeployment ? {
        id: clean(latestDeployment.id),
        createdOn: clean(latestDeployment.created_on),
        versions: (Array.isArray(latestDeployment.versions) ? latestDeployment.versions : []).map(item => ({
          versionId: clean(item?.version_id),
          percentage: Number.isFinite(Number(item?.percentage)) ? Number(item.percentage) : 0
        }))
      } : null,
      version: latestVersion ? {
        id: clean(latestVersion.id),
        createdOn: clean(latestVersion.created_on),
        triggeredBy: clean(latestVersion.annotations?.['workers/triggered_by'])
      } : null,
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
