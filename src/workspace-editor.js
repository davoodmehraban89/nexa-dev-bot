import {
  WORKSPACE_EDITOR_LIMITS,
  digestText,
  validateEditableFile
} from './core/workspace-policy.js';
import { validateTelegramWebAppInitData } from './core/telegram-webapp-auth.js';
import { readBoundedJson } from './core/bounded-json.js';

const WORKSPACE_ID = /^[A-Za-z0-9_-]{10}$/;

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

function safeWorkspaceId(value) {
  const id = String(value || '');
  if (!WORKSPACE_ID.test(id)) throw new Error('Workspace ID is invalid');
  return id;
}

function statusForError(error) {
  const message = String(error?.message || '');
  if (/signature|hash|auth_date|owner|initData|user/i.test(message)) return 403;
  if (/not found|expired/i.test(message)) return 404;
  if (/limited|not editable|binary|LFS|sensitive/i.test(message)) return 422;
  if (/invalid|required|JSON|body|path|member|Change Set/i.test(message)) return 400;
  return 500;
}

export async function handleWorkspaceEditorRequest(request, {
  workspaces,
  botToken,
  ownerId,
  now = () => Date.now()
} = {}) {
  try {
    if (!workspaces) throw new Error('Durable workspace store is not configured');
    const initData = request.headers.get('x-telegram-init-data') || '';
    const identity = await validateTelegramWebAppInitData(initData, {
      botToken,
      ownerId,
      now,
      maxAgeSeconds: 3600
    });
    const owner = identity.userId;
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const workspaceId = safeWorkspaceId(url.searchParams.get('workspaceId'));
      const workspace = await workspaces.getWorkspace({ ownerId: owner, workspaceId });
      if (!workspace) throw new Error('Workspace not found or expired');
      const files = Array.isArray(workspace.files) && workspace.files.length ? workspace.files : [{ path: workspace.path, draftText: workspace.draftText }];
      const requestedPath = String(url.searchParams.get('path') || workspace.path || files[0].path);
      const selected = files.find(file => file.path === requestedPath);
      if (!selected) throw new Error('Editor path is not a member of this Change Set');
      return jsonResponse({
        workspace: {
          id: workspace.id,
          path: selected.path,
          files: files.map(file => ({ path: file.path })),
          state: workspace.state || 'DRAFT',
          baseHeadSha: String(workspace.baseHeadSha || '').slice(0, 10),
          draftText: String(selected.draftText ?? '')
        },
        limits: WORKSPACE_EDITOR_LIMITS
      });
    }

    if (request.method === 'PUT') {
      let body;
      try {
        body = await readBoundedJson(request, WORKSPACE_EDITOR_LIMITS.maxBytes + 4096);
      } catch (error) {
        if (error instanceof RangeError) return jsonResponse({ ok: false, error: 'Editor request body is too large' }, 413);
        if (error instanceof SyntaxError) return jsonResponse({ ok: false, error: 'Editor request body must be valid JSON' }, 400);
        throw error;
      }
      const workspaceId = safeWorkspaceId(body?.workspaceId);
      const workspace = await workspaces.getWorkspace({ ownerId: owner, workspaceId });
      if (!workspace) throw new Error('Workspace not found or expired');
      const files = Array.isArray(workspace.files) && workspace.files.length ? workspace.files : [{ path: workspace.path, draftText: workspace.draftText }];
      const requestedPath = String(body?.path || workspace.path || files[0].path);
      const selected = files.find(file => file.path === requestedPath);
      if (!selected) throw new Error('Editor path is not a member of this Change Set');
      const policy = validateEditableFile({ path: selected.path, text: body?.text });
      if (!policy.editable) return jsonResponse({ ok: false, error: policy.reason }, 422);
      const digest = await digestText(policy.text);
      const updated = typeof workspaces.updateWorkspaceFileDraft === 'function'
        ? await workspaces.updateWorkspaceFileDraft({ ownerId: owner, workspaceId, path: selected.path, text: policy.text, digest })
        : await workspaces.updateDraft({ ownerId: owner, workspaceId, text: policy.text, digest });
      return jsonResponse({
        ok: true,
        workspace: {
          id: updated?.id || workspaceId,
          path: selected.path,
          state: updated?.state || 'DRAFT',
          charLength: policy.charLength,
          byteLength: policy.byteLength
        }
      });
    }

    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  } catch (error) {
    const status = statusForError(error);
    return jsonResponse({ ok: false, error: status === 500 ? 'Workspace editor request failed' : String(error?.message || 'Workspace editor request failed') }, status);
  }
}

export function renderWorkspaceEditorPage() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>Nexa Workspace Editor</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}
    *{box-sizing:border-box}body{margin:0;background:var(--tg-theme-bg-color,#111827);color:var(--tg-theme-text-color,#f9fafb)}
    main{min-height:100vh;display:flex;flex-direction:column;gap:10px;padding:12px max(12px,env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
    .meta{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:13px}.path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:left}
    textarea{width:100%;flex:1;min-height:58vh;resize:none;border:1px solid var(--tg-theme-hint-color,#6b7280);border-radius:10px;padding:12px;background:var(--tg-theme-secondary-bg-color,#1f2937);color:var(--tg-theme-text-color,#f9fafb);font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;direction:ltr;text-align:left;tab-size:2;white-space:pre;overflow:auto}
    .status{min-height:22px;font-size:13px;color:var(--tg-theme-hint-color,#9ca3af)}.status.error{color:#ef4444}.status.ok{color:#22c55e}
    .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.actions button{border:0;border-radius:10px;padding:12px;font-weight:700;cursor:pointer}.primary{background:var(--tg-theme-button-color,#2563eb);color:var(--tg-theme-button-text-color,#fff)}.secondary{background:var(--tg-theme-secondary-bg-color,#374151);color:var(--tg-theme-text-color,#fff)}
  </style>
</head>
<body>
<main>
  <div class="meta"><strong>🧑‍💻 Workspace Editor</strong><span id="counter">—</span></div>
  <select id="files" aria-label="فایل Change Set" disabled></select>
  <div id="path" class="path">در حال بارگذاری…</div>
  <textarea id="editor" spellcheck="false" autocapitalize="off" autocomplete="off" disabled></textarea>
  <div id="status" class="status">در حال اتصال امن به Workspace…</div>
  <div class="actions"><button id="save" class="primary" disabled>💾 ذخیره Draft</button><button id="close" class="secondary">↩️ بازگشت به ربات</button></div>
</main>
<script>
(() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  const editor = document.getElementById('editor');
  const status = document.getElementById('status');
  const path = document.getElementById('path');
  const files = document.getElementById('files');
  const counter = document.getElementById('counter');
  const save = document.getElementById('save');
  const close = document.getElementById('close');
  const params = new URLSearchParams(location.search);
  const workspaceId = params.get('workspaceId') || '';
  const byteLength = value => new TextEncoder().encode(value).byteLength;
  const codePoints = value => Array.from(value).length;
  let limits = { maxChars: 20000, maxBytes: 65536 };

  function setStatus(message, kind='') { status.textContent = message; status.className = 'status' + (kind ? ' ' + kind : ''); }
  function updateCounter() {
    const chars = codePoints(editor.value); const bytes = byteLength(editor.value);
    counter.textContent = chars.toLocaleString() + ' / ' + limits.maxChars.toLocaleString() + ' · ' + bytes.toLocaleString() + ' B / ' + limits.maxBytes.toLocaleString() + ' B';
    const valid = chars <= limits.maxChars && bytes <= limits.maxBytes;
    save.disabled = !valid || editor.disabled;
    if (!valid) setStatus('محتوا از سقف امن Editor بیشتر است.', 'error');
  }
  async function api(url, options={}) {
    const headers = Object.assign({}, options.headers || {}, { 'x-telegram-init-data': tg ? tg.initData : '' });
    const response = await fetch(url, Object.assign({}, options, { headers }));
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || ('HTTP ' + response.status));
    return body;
  }
  async function load() {
    if (!tg || !tg.initData) throw new Error('این Editor باید از داخل Telegram باز شود.');
    tg.ready(); tg.expand();
    if (!/^[A-Za-z0-9_-]{10}$/.test(workspaceId)) throw new Error('Workspace نامعتبر است.');
    const selectedPath = params.get('path') || '';
    const body = await api('/workspace/api/editor?workspaceId=' + encodeURIComponent(workspaceId) + (selectedPath ? '&path=' + encodeURIComponent(selectedPath) : ''));
    limits = body.limits || limits;
    // Never interpolate repository-controlled paths into HTML.
    files.replaceChildren();
    for (const file of (body.workspace.files || [{path:body.workspace.path}])) {
      const option = document.createElement('option');
      option.value = file.path;
      option.textContent = file.path;
      files.appendChild(option);
    }
    files.value = body.workspace.path; files.disabled = false;
    path.textContent = body.workspace.path;
    editor.value = body.workspace.draftText || '';
    editor.disabled = false;
    setStatus('Draft محلی آماده ویرایش است؛ تا قبل از Safe Approval هیچ تغییری در GitHub انجام نمی‌شود.');
    updateCounter();
  }
  editor.addEventListener('input', updateCounter);
  files.addEventListener('change', () => { params.set('path', files.value); location.search = params.toString(); });
  save.addEventListener('click', async () => {
    save.disabled = true; setStatus('در حال ذخیره Draft…');
    try {
      await api('/workspace/api/editor', { method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({workspaceId, path:files.value, text:editor.value}) });
      setStatus('Draft ذخیره شد. برای Diff و Commit به ربات برگردید.', 'ok');
      updateCounter();
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) { setStatus(error.message || 'ذخیره Draft ناموفق بود.', 'error'); updateCounter(); }
  });
  close.addEventListener('click', () => { if (tg) tg.close(); else history.back(); });
  load().catch(error => { editor.disabled = true; save.disabled = true; setStatus(error.message || 'Editor قابل استفاده نیست.', 'error'); });
})();
</script>
</body>
</html>`;
}

export function workspaceEditorPageResponse() {
  return new Response(renderWorkspaceEditorPage(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'"
    }
  });
}
