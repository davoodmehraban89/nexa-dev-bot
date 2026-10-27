import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudflarePlugin } from '../src/plugins/cloudflare/plugin.js';

function callbacks(view) {
  return (view.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => button.callback_data)
    .filter(Boolean);
}

function telegramContract(view) {
  assert.ok(view?.text);
  assert.ok(view.text.length <= 4096);
  for (const callback of callbacks(view)) {
    assert.ok(Buffer.byteLength(callback, 'utf8') <= 64, callback);
  }
}

test('Cloudflare plugin exposes CP4 read and destructive actions explicitly', () => {
  const plugin = createCloudflarePlugin({
    cloudflare: { isConfigured: () => true }
  });
  assert.equal(plugin.manifest.id, 'cloudflare');
  assert.deepEqual(plugin.manifest.actions, {
    'cloudflare.worker.status': { risk: 'READ' },
    'cloudflare.worker.versions': { risk: 'READ' },
    'cloudflare.worker.deploy_version': { risk: 'DESTRUCTIVE' },
    'cloudflare.delivery.status': { risk: 'READ' }
  });
});

test('cf:status renders source-backed worker deployment details with refresh and recovery', async () => {
  const cloudflare = {
    isConfigured: () => true,
    async getWorkerSnapshot() {
      return {
        workerName: 'nexa-dev-bot',
        deployment: {
          id: 'dep-1',
          createdOn: '2026-10-04T19:34:03Z',
          versions: [{ versionId: 'ver-1', percentage: 100 }]
        },
        version: {
          id: 'ver-1',
          createdOn: '2026-10-04T19:34:01Z',
          triggeredBy: 'upload'
        },
        bindings: [
          { name: 'WORKSPACE_STORE', type: 'durable_object_namespace' },
          { name: 'GITHUB_TOKEN', type: 'secret_text' }
        ],
        observability: {
          enabled: true,
          logsEnabled: true,
          invocationLogs: true,
          tracesEnabled: false
        }
      };
    }
  };
  const plugin = createCloudflarePlugin({ cloudflare });
  const route = plugin.resolveCallback('cf:status');
  assert.equal(route?.actionId, 'cloudflare.worker.status');
  const view = await route.execute();
  telegramContract(view);
  assert.match(view.text, /nexa-dev-bot/);
  assert.match(view.text, /ver-1/);
  assert.match(view.text, /100%/);
  assert.match(view.text, /WORKSPACE_STORE/);
  assert.match(view.text, /GITHUB_TOKEN/);
  assert.match(view.text, /Observability|مشاهده.?پذیری/i);
  assert.ok(callbacks(view).includes('cf:status'));
  assert.ok(callbacks(view).includes('menu:tools'));
});

test('Cloudflare plugin renders explicit unavailable state without fabricating health', async () => {
  const plugin = createCloudflarePlugin({
    cloudflare: { isConfigured: () => false }
  });
  const view = await plugin.resolveCallback('cf:status').execute();
  telegramContract(view);
  assert.match(view.text, /پیکربندی نشده|not configured/i);
  assert.doesNotMatch(view.text, /✅.*فعال|healthy/i);
});

test('Cloudflare plugin escapes provider-controlled text and handles empty provider state', async () => {
  const cloudflare = {
    isConfigured: () => true,
    async getWorkerSnapshot() {
      return {
        workerName: '<worker&name>',
        deployment: null,
        version: null,
        bindings: [{ name: '<TOKEN>', type: 'secret_text' }],
        observability: {
          enabled: false,
          logsEnabled: false,
          invocationLogs: false,
          tracesEnabled: false
        }
      };
    }
  };
  const view = await createCloudflarePlugin({ cloudflare })
    .resolveCallback('cf:status')
    .execute();
  telegramContract(view);
  assert.doesNotMatch(view.text, /<worker&name>|<TOKEN>/);
  assert.match(view.text, /&lt;worker&amp;name&gt;/);
  assert.match(view.text, /deployment|استقرار/i);
});
