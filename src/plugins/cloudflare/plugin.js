import { cloudflarePluginManifest } from './manifest.js';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const mark = value => value ? '✅' : '❌';

function unavailableView() {
  return {
    text:
`☁️ <b>Cloudflare Worker</b>
➖➖➖➖➖➖➖➖➖➖
❌ Provider Cloudflare پیکربندی نشده است.

برای فعال‌شدن این گزارش، <code>CLOUDFLARE_API_TOKEN</code>، <code>CLOUDFLARE_ACCOUNT_ID</code> و <code>CLOUDFLARE_WORKER_NAME</code> باید در Runtime تنظیم باشند.

هیچ وضعیت موفق ساختگی نمایش داده نمی‌شود.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 بررسی مجدد', callback_data: 'cf:status' }],
        [{ text: '🔙 ابزارها', callback_data: 'menu:tools' }]
      ]
    }
  };
}

function snapshotView(snapshot) {
  const deployment = snapshot.deployment;
  const version = snapshot.version;
  const traffic = deployment?.versions?.length
    ? deployment.versions.map(item => `${escapeHtml(item.versionId || '-')} — ${Number(item.percentage || 0)}%`).join('\n')
    : 'استقرار فعالی گزارش نشده است.';
  const bindings = snapshot.bindings?.length
    ? snapshot.bindings.slice(0, 20).map(item => `• <code>${escapeHtml(item.name || '-')}</code> — ${escapeHtml(item.type || '-')}`).join('\n')
    : '<i>Bindingی گزارش نشده است.</i>';
  const obs = snapshot.observability || {};

  return {
    text:
`☁️ <b>Cloudflare Worker — ${escapeHtml(snapshot.workerName || '-')}</b>
➖➖➖➖➖➖➖➖➖➖
<b>Deployment</b>
ID: <code>${escapeHtml(deployment?.id || '-')}</code>
Created: <code>${escapeHtml(deployment?.createdOn || '-')}</code>
Traffic:
${traffic}

<b>Version</b>
ID: <code>${escapeHtml(version?.id || '-')}</code>
Created: <code>${escapeHtml(version?.createdOn || '-')}</code>
Triggered by: <code>${escapeHtml(version?.triggeredBy || '-')}</code>

<b>Bindings</b>
${bindings}

<b>Observability / مشاهده‌پذیری</b>
• Observability: ${mark(obs.enabled)}
• Logs: ${mark(obs.logsEnabled)}
• Invocation logs: ${mark(obs.invocationLogs)}
• Traces: ${mark(obs.tracesEnabled)}

این گزارش READ-only است و مقدار هیچ Secretی را نمایش نمی‌دهد.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 بروزرسانی', callback_data: 'cf:status' }],
        [{ text: '🔙 ابزارها', callback_data: 'menu:tools' }]
      ]
    }
  };
}

export function createCloudflarePlugin({ cloudflare } = {}) {
  return {
    manifest: cloudflarePluginManifest,
    resolveCallback(data) {
      if (String(data || '') !== 'cf:status') return null;
      return {
        actionId: 'cloudflare.worker.status',
        kind: 'worker-status',
        async execute() {
          if (!cloudflare?.isConfigured?.()) return unavailableView();
          const snapshot = await cloudflare.getWorkerSnapshot();
          return snapshotView(snapshot);
        }
      };
    }
  };
}
