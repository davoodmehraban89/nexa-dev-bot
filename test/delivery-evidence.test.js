import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { correlateDeliveryState } from '../src/core/cicd-control-plane.js';
import { CloudflareService } from '../src/plugins/cloudflare/service.js';
import { createCloudflarePlugin } from '../src/plugins/cloudflare/plugin.js';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const activeId = '11111111-1111-4111-8111-111111111111';
const latestId = '22222222-2222-4222-8222-222222222222';
const deployment = {
  id: 'dep-active',
  versions: [{ versionId: activeId, percentage: 100 }]
};
const runs = {
  targetSha: sha,
  ci: { sha, status: 'completed', conclusion: 'success' },
  deploy: { sha, status: 'completed', conclusion: 'success' }
};
const version = (annotations = { 'workers/tag': sha }, id = activeId) => ({
  id,
  annotations
});

test('delivery requires explicit SHA metadata for the version receiving traffic', () => {
  for (const runtime of [
    { deployment },
    { deployment, version: { id: activeId } },
    { deployment, version: { id: activeId, sha } },
    { deployment, version: version({ 'workers/message': sha }) },
    { deployment, version: version({ 'workers/sha': sha }) },
    { deployment, version: version({ 'workers/tag': sha.slice(0, 12) }) },
    { deployment, version: version({ 'workers/commit_sha': 'invalid' }) },
    { deployment, version: version({ 'workers/tag': [sha] }) }
  ]) {
    const state = correlateDeliveryState({ ...runs, runtime });
    assert.equal(state.state, 'unknown', JSON.stringify(runtime));
    assert.match(state.reason, /SHA|evidence/i);
  }
});

test('delivery rejects another version metadata even when its SHA matches', () => {
  const state = correlateDeliveryState({
    ...runs,
    runtime: { deployment, version: version(undefined, latestId) }
  });
  assert.equal(state.state, 'mismatch');
});

test('delivery rejects an active version whose explicit SHA differs from target', () => {
  for (const annotations of [
    { 'workers/tag': otherSha },
    { 'workers/commit_sha': otherSha },
    { 'workers/commit_sha': otherSha, 'workers/tag': sha }
  ]) {
    const state = correlateDeliveryState({
      ...runs,
      runtime: { deployment, version: version(annotations) }
    });
    assert.equal(state.state, 'mismatch');
    assert.match(state.reason, /SHA/i);
  }
});

test('delivery accepts only full matching SHA markers tied to the active version', () => {
  for (const annotations of [
    { 'workers/tag': sha },
    { 'workers/commit_sha': sha },
    { 'workers/tag': sha.toUpperCase(), 'workers/commit_sha': sha },
    { 'workers/commit_sha': sha, 'workers/tag': 'release-1' }
  ]) {
    const state = correlateDeliveryState({
      ...runs,
      runtime: { deployment, version: version(annotations) }
    });
    assert.equal(state.state, 'success');
    assert.equal(state.sha, sha);
    assert.equal(state.versionId, activeId);
    assert.equal(state.deploymentId, deployment.id);
  }
});

function serviceFor({ items = [], active = deployment.versions, detail } = {}) {
  const calls = [];
  const service = new CloudflareService({
    token: 'cf-token',
    accountId: 'account',
    workerName: 'nexa-dev-bot',
    async fetchImpl(url, options) {
      const path = new URL(url).pathname;
      calls.push({ path, method: options.method });
      let result;
      if (path.endsWith('/deployments')) {
        result = {
          deployments: [
            {
              id: deployment.id,
              versions: active.map(({ versionId, percentage }) => ({
                version_id: versionId,
                percentage
              }))
            }
          ]
        };
      } else if (path.endsWith('/versions')) result = { items };
      else if (path.endsWith(`/versions/${activeId}`)) result = detail;
      else if (path.endsWith('/settings')) result = {};
      else throw new Error('Unexpected Cloudflare path');
      return new Response(JSON.stringify({ success: true, result }));
    }
  });
  return { service, calls };
}

test('snapshot selects deployed version metadata instead of a newer unused upload', async () => {
  const { service, calls } = serviceFor({
    items: [
      version({ 'workers/tag': sha }, latestId),
      {
        ...version({ 'workers/commit_sha': otherSha }),
        metadata: { created_on: '2026-10-24T00:00:00Z' }
      }
    ]
  });
  const snapshot = await service.getWorkerSnapshot();
  assert.equal(snapshot.version.id, activeId);
  assert.equal(snapshot.version.createdOn, '2026-10-24T00:00:00Z');
  assert.deepEqual(snapshot.version.annotations, {
    'workers/commit_sha': otherSha
  });
  assert.equal(
    correlateDeliveryState({ ...runs, runtime: snapshot }).state,
    'mismatch'
  );
  assert.equal(calls.length, 3);
});

test('snapshot fetches deployed version when it is absent from the latest versions page', async () => {
  const { service, calls } = serviceFor({
    items: [version({ 'workers/tag': otherSha }, latestId)],
    detail: version()
  });
  const snapshot = await service.getWorkerSnapshot();
  assert.equal(snapshot.version.id, activeId);
  assert.deepEqual(snapshot.version.annotations, { 'workers/tag': sha });
  assert.equal(
    correlateDeliveryState({ ...runs, runtime: snapshot }).state,
    'success'
  );
  assert.ok(calls.some(({ path }) => path.endsWith(`/versions/${activeId}`)));
  assert.ok(calls.every(({ method }) => method === 'GET'));
});

test('snapshot fetches SHA annotations absent from the minimal deployed version listing', async () => {
  const { service, calls } = serviceFor({
    items: [{ id: activeId, metadata: { source: 'wrangler' } }],
    detail: version({ 'workers/commit_sha': sha })
  });
  const snapshot = await service.getWorkerSnapshot();
  assert.equal(
    correlateDeliveryState({ ...runs, runtime: snapshot }).state,
    'success'
  );
  assert.ok(calls.some(({ path }) => path.endsWith(`/versions/${activeId}`)));
});

test('snapshot stays unverified when deployed version detail lacks SHA annotations', async () => {
  const { service } = serviceFor({
    items: [{ id: activeId }],
    detail: { id: activeId }
  });
  const snapshot = await service.getWorkerSnapshot();
  assert.equal(snapshot.version.id, activeId);
  assert.equal(
    correlateDeliveryState({ ...runs, runtime: snapshot }).state,
    'unknown'
  );
});

test('snapshot detail errors propagate through the existing redacted provider boundary', async () => {
  const service = new CloudflareService({
    token: 'cf-token',
    accountId: 'account',
    workerName: 'nexa-dev-bot',
    async fetchImpl(url) {
      let result;
      if (String(url).endsWith('/deployments')) {
        result = {
          deployments: [
            { versions: [{ version_id: activeId, percentage: 100 }] }
          ]
        };
      } else if (String(url).endsWith('/versions')) result = { items: [] };
      else if (String(url).endsWith('/settings')) result = {};
      else
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: 'bad credential cf-token' }]
          }),
          { status: 403 }
        );
      return new Response(JSON.stringify({ success: true, result }));
    }
  });
  await assert.rejects(service.getWorkerSnapshot(), (error) => {
    assert.match(error.message, /403.*\[REDACTED\]/);
    assert.doesNotMatch(error.message, /cf-token/);
    return true;
  });
});

test('snapshot never substitutes unrelated metadata returned by a version detail read', async () => {
  const { service } = serviceFor({
    items: [version(undefined, latestId)],
    detail: version(undefined, latestId)
  });
  const snapshot = await service.getWorkerSnapshot();
  assert.equal(snapshot.version, null);
  assert.equal(
    correlateDeliveryState({ ...runs, runtime: snapshot }).state,
    'unknown'
  );
});

test('snapshot has no single active version for absent or split traffic', async () => {
  for (const active of [
    [],
    [
      { versionId: activeId, percentage: 50 },
      { versionId: latestId, percentage: 50 }
    ]
  ]) {
    const { service } = serviceFor({ items: [version()], active });
    const snapshot = await service.getWorkerSnapshot();
    assert.equal(snapshot.version, null);
    assert.equal(
      correlateDeliveryState({ ...runs, runtime: snapshot }).state,
      'mismatch'
    );
  }
});

test('delivery view reports unknown when workflow success has no runtime SHA evidence', async () => {
  const plugin = createCloudflarePlugin({
    cloudflare: {
      workerName: 'nexa-dev-bot',
      isConfigured: () => true,
      getWorkerSnapshot: async () => ({ deployment, version: { id: activeId } })
    },
    github: {
      listRepositories: async () => [
        { id: '123', name: 'nexa-dev-bot', defaultBranch: 'main' }
      ],
      listCommits: async () => [{ fullSha: sha }],
      listWorkflowRuns: async () =>
        ['CI', 'Deploy Cloudflare Worker'].map((name) => ({
          name,
          branch: 'main',
          fullSha: sha,
          ...runs.ci
        }))
    }
  });
  const view = await plugin.resolveCallback('cf:delivery').execute();
  assert.match(view.text, /UNKNOWN/);
  assert.doesNotMatch(view.text, /SUCCESS|موفق/);
});

test('production deployment pins Wrangler and tags the checked out verified commit', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/deploy.yml', import.meta.url),
    'utf8'
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/
  );
  assert.match(
    workflow,
    /DEPLOY_COMMIT_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/
  );
  assert.match(
    workflow,
    /wrangler@4\.152\.0 deploy --tag "\$DEPLOY_COMMIT_SHA"/
  );
  assert.doesNotMatch(workflow, /wrangler@4\s/);
});
