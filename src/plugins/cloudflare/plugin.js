import { cloudflarePluginManifest } from './manifest.js';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const mark = value => value ? '✅' : '❌';
const VERSION_ID = /^[0-9a-f-]{36}$/i;

function unavailableView() {
  return {
    text: '☁️ <b>Cloudflare Worker</b>\n❌ Provider Cloudflare پیکربندی نشده است.\nهیچ وضعیت موفق ساختگی نمایش داده نمی‌شود.',
    reply_markup: { inline_keyboard: [[{ text: '🔄 بررسی مجدد', callback_data: 'cf:status' }],[{ text: '🔙 ابزارها', callback_data: 'menu:tools' }]] }
  };
}

function snapshotView(snapshot) {
  const deployment=snapshot.deployment, version=snapshot.version, obs=snapshot.observability||{};
  const traffic=deployment?.versions?.length ? deployment.versions.map(i=>`${escapeHtml(i.versionId||'-')} — ${Number(i.percentage||0)}%`).join('\n') : 'استقرار فعالی گزارش نشده است.';
  const bindings=snapshot.bindings?.length ? snapshot.bindings.slice(0,20).map(i=>`• <code>${escapeHtml(i.name||'-')}</code> — ${escapeHtml(i.type||'-')}`).join('\n') : '<i>Bindingی گزارش نشده است.</i>';
  return {
    text:`☁️ <b>Cloudflare Worker — ${escapeHtml(snapshot.workerName||'-')}</b>
➖➖➖➖➖➖➖➖➖➖
<b>Deployment</b>
ID: <code>${escapeHtml(deployment?.id||'-')}</code>
Created: <code>${escapeHtml(deployment?.createdOn||'-')}</code>
Traffic:
${traffic}

<b>Version</b>
ID: <code>${escapeHtml(version?.id||'-')}</code>

<b>Bindings</b>
${bindings}

<b>Observability</b>
• Observability: ${mark(obs.enabled)}
• Logs: ${mark(obs.logsEnabled)}
• Invocation logs: ${mark(obs.invocationLogs)}
• Traces: ${mark(obs.tracesEnabled)}

Secret values نمایش داده نمی‌شوند.`,
    reply_markup:{inline_keyboard:[
      [{text:'📚 نسخه‌ها / Rollback',callback_data:'cf:versions'}],
      [{text:'🔄 بروزرسانی',callback_data:'cf:status'}],
      [{text:'🔙 ابزارها',callback_data:'menu:tools'}]
    ]}
  };
}

function versionsView(versions=[]) {
  const rows=versions.slice(0,10).filter(v=>VERSION_ID.test(v.id)).map(v=>[
    {text:`🚀 ${v.id.slice(0,8)} · ${String(v.createdOn||'').slice(0,10)}`,callback_data:`cfdeploy:${v.id}`}
  ]);
  return {
    text:`☁️ <b>Cloudflare Versions</b>
هر Deploy/Rollback یک عملیات DESTRUCTIVE با Safe Approval است.
➖➖➖➖➖➖➖➖➖➖
${versions.slice(0,10).map(v=>`• <code>${escapeHtml(v.id)}</code>\n  ${escapeHtml(v.createdOn||'-')} · ${escapeHtml(v.triggeredBy||'-')}`).join('\n\n')||'<i>نسخه‌ای گزارش نشده است.</i>'}`,
    reply_markup:{inline_keyboard:[...rows,[{text:'🔄 بروزرسانی',callback_data:'cf:versions'}],[{text:'🔙 Cloudflare',callback_data:'cf:status'}]]}
  };
}

export function createCloudflarePlugin({ cloudflare } = {}) {
  return {
    manifest: cloudflarePluginManifest,
    resolveCallback(data) {
      const value=String(data||'');
      if(value==='cf:status') return {actionId:'cloudflare.worker.status',kind:'worker-status',async execute(){if(!cloudflare?.isConfigured?.())return unavailableView();return snapshotView(await cloudflare.getWorkerSnapshot());}};
      if(value==='cf:versions') return {actionId:'cloudflare.worker.versions',kind:'versions',async execute(){if(!cloudflare?.isConfigured?.())return unavailableView();return versionsView(await cloudflare.listVersions());}};
      const m=value.match(/^cfdeploy:([0-9a-f-]{36})$/i);
      if(m) {
        const versionId=m[1];
        return {
          actionId:'cloudflare.worker.deploy_version',
          approval:{input:{versionId},label:`Deploy/Rollback Cloudflare ${versionId.slice(0,8)}`,cancelCallback:'cf:versions'},
          async execute(){
            const result=await cloudflare.deployVersion(versionId);
            return {text:`✅ Cloudflare version <code>${escapeHtml(result.versionId)}</code> با 100% traffic تأیید شد.`,reply_markup:{inline_keyboard:[[{text:'☁️ وضعیت',callback_data:'cf:status'}]]}};
          }
        };
      }
      return null;
    }
  };
}
