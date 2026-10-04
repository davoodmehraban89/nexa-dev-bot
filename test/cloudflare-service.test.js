import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareService } from '../src/plugins/cloudflare/service.js';

const accountId = 'acct-123';
const workerName = 'nexa-dev-bot';
const token = 'cf-secret-token';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

test('CloudflareService is fail-closed when configuration is incomplete', async () => {
  for (const input of [
    {},
    { token, accountId },
    { token, workerName },
    { accountId, workerName }
  ]) {
    const service = new CloudflareService(input);
    assert.equal(service.isConfigured(), false);
    await assert.rejects(() => service.getWorkerSnapshot(), /not configured/i);
  }
});

test('CloudflareService normalizes deployment, version, bindings and observability reads', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const value = String(url);
    if (value.endsWith('/deployments')) return response({ success: true, result: { deployments: [{ id: 'dep-1', created_on: '2026-10-04T19:34:03Z', versions: [{ version_id: 'ver-1', percentage: 100 }] }] } });
    if (value.endsWith('/versions')) return response({ success: true, result: { items: [{ id: 'ver-1', created_on: '2026-10-04T19:34:01Z', annotations: { 'workers/triggered_by': 'upload' } }] } });
    if (value.endsWith('/settings')) return response({ success: true, result: { bindings: [{ name: 'WORKSPACE_STORE', type: 'durable_object_namespace' }, { name: 'GITHUB_TOKEN', type: 'secret_text' }], observability: { enabled: true, logs: { enabled: true, invocation_logs: true }, traces: { enabled: false } } } });
    return response({ success: false, errors: [{ message: 'Not Found' }] }, 404);
  };

  const service = new CloudflareService({ token, accountId, workerName, fetchImpl });
  assert.equal(service.isConfigured(), true);
  const snapshot = await service.getWorkerSnapshot();

  assert.equal(snapshot.workerName, workerName);
  assert.equal(snapshot.deployment.id, 'dep-1');
  assert.equal(snapshot.deployment.versions[0].versionId, 'ver-1');
  assert.equal(snapshot.deployment.versions[0].percentage, 100);
  assert.equal(snapshot.version.id, 'ver-1');
  assert.deepEqual(snapshot.bindings, [
    { name: 'WORKSPACE_STORE', type: 'durable_object_namespace' },
    { name: 'GITHUB_TOKEN', type: 'secret_text' }
  ]);
  assert.deepEqual(snapshot.observability, {
    enabled: true,
    logsEnabled: true,
    invocationLogs: true,
    tracesEnabled: false
  });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, `Bearer ${token}`);
    assert.equal(call.options.headers['Content-Type'], 'application/json');
  }
});

test('CloudflareService returns explicit empty state when provider has no deployment or version items', async () => {
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/deployments')) return response({ success: true, result: { deployments: [] } });
    if (value.endsWith('/versions')) return response({ success: true, result: { items: [] } });
    if (value.endsWith('/settings')) return response({ success: true, result: {} });
    throw new Error('unexpected URL');
  };
  const service = new CloudflareService({ token, accountId, workerName, fetchImpl });
  const snapshot = await service.getWorkerSnapshot();
  assert.equal(snapshot.deployment, null);
  assert.equal(snapshot.version, null);
  assert.deepEqual(snapshot.bindings, []);
  assert.deepEqual(snapshot.observability, {
    enabled: false,
    logsEnabled: false,
    invocationLogs: false,
    tracesEnabled: false
  });
});

test('CloudflareService reports provider failure without leaking token', async () => {
  const fetchImpl = async () => response({ success: false, errors: [{ message: `bad credential ${token}` }] }, 403);
  const service = new CloudflareService({ token, accountId, workerName, fetchImpl });

  await assert.rejects(async () => {
    await service.getWorkerSnapshot();
  }, error => {
    assert.match(error.message, /403/);
    assert.doesNotMatch(error.message, new RegExp(token));
    assert.match(error.message, /\[REDACTED\]/);
    return true;
  });
});
