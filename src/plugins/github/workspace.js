import {
  buildUnifiedDiff,
  digestText,
  makeTargetBranch,
  normalizeCommitMessage,
  validateEditableFile
} from '../../core/workspace-policy.js';
import { DEFAULT_CONFIG } from '../../config.js';
import { commitWorkspaceIntent } from './workspace-commit.js';

export { commitWorkspaceIntent } from './workspace-commit.js';

const HANDLE_10 = '[A-Za-z0-9_-]{10}';
const INTENT_8 = '[A-Za-z0-9_-]{8}';
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const short = (value, max = 70) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const ownerFrom = context => {
  const ownerId = String(context?.ownerId ?? '');
  if (!ownerId) throw new Error('Workspace owner is required');
  return ownerId;
};

function parseCallback(data) {
  const value = String(data || '');
  let match = value.match(/^(?:files):(\d+)$/);
  if (match) return { actionId: 'github.files.list', kind: 'root', repoId: Number(match[1]) };
  match = value.match(new RegExp(`^wnav:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.navigate', kind: 'navigate', refId: match[1] };
  match = value.match(new RegExp(`^wedit:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.create', kind: 'edit', refId: match[1] };
  match = value.match(new RegExp(`^ws:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.view', kind: 'workspace', workspaceId: match[1] };
  match = value.match(new RegExp(`^wadd:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.file.add', kind: 'add_file', refId: match[1] };
  match = value.match(new RegExp(`^wremove:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.file.remove', kind: 'remove_file', refId: match[1] };
  match = value.match(new RegExp(`^wfiles:(${HANDLE_10}):(\\d+)$`));
  if (match) return { actionId: 'github.workspace.file.pick', kind: 'pick_file', workspaceId: match[1], repoId: Number(match[2]) };
  match = value.match(new RegExp(`^wfile:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.input.prepare', kind: 'input', workspaceId: match[1], mode: 'draft_file' };
  match = value.match(new RegExp(`^wtext:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.input.prepare', kind: 'input', workspaceId: match[1], mode: 'draft' };
  match = value.match(new RegExp(`^wmsg:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.input.prepare', kind: 'input', workspaceId: match[1], mode: 'commit_message' };
  match = value.match(new RegExp(`^wdiff:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.diff', kind: 'diff', workspaceId: match[1] };
  match = value.match(new RegExp(`^wready:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.ready', kind: 'ready', workspaceId: match[1] };
  match = value.match(new RegExp(`^wcancel:(${HANDLE_10})$`));
  if (match) return { actionId: 'github.workspace.cancel', kind: 'cancel', workspaceId: match[1] };
  match = value.match(new RegExp(`^wscommit:(\\d+):(${INTENT_8})$`));
  if (match) return {
    actionId: 'github.workspace.commit_branch',
    kind: 'commit',
    repoId: Number(match[1]),
    intentId: match[2]
  };
  return null;
}

function editorUrlFor(workspace, editorUrl) {
  const configured = String(editorUrl || '').trim();
  if (!configured) return '';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:') return '';
    url.searchParams.set('workspaceId', workspace.id);
    return url.toString();
  } catch {
    return '';
  }
}

function workspaceButtons(workspace, editorUrl) {
  const editor = editorUrlFor(workspace, editorUrl);
  const firstRow = [];
  if (editor) firstRow.push({ text: '🧑‍💻 Editor', web_app: { url: editor } });
  firstRow.push({ text: '📎 بارگذاری فایل', callback_data: `wfile:${workspace.id}` });
  if (!editor) firstRow.push({ text: '📝 Paste متن', callback_data: `wtext:${workspace.id}` });
  return [
    firstRow,
    [{ text: '✍️ پیام Commit', callback_data: `wmsg:${workspace.id}` }],
    [
      { text: '🔍 Diff', callback_data: `wdiff:${workspace.id}` },
      { text: '✅ آماده Commit', callback_data: `wready:${workspace.id}` }
    ],
    [
      { text: '🗑 لغو Draft', callback_data: `wcancel:${workspace.id}` },
      { text: '🔙 فایل‌ها', callback_data: `files:${workspace.repoId}` }
    ]
  ];
}

function workspaceCommitResultView(repoId, intent, result) {
  const rows = [
    [{ text: '🧪 CI / Actions', callback_data: `runs:${repoId}` }]
  ];
  if (intent?.workspaceId) {
    rows.push([{ text: '📝 Workspace', callback_data: `ws:${intent.workspaceId}` }]);
  }
  rows.push([{ text: '📦 پروژه', callback_data: `repo:${repoId}` }]);
  return {
    text: `✅ <b>Commit روی branch جدید ایجاد شد</b>\nBranch: <code>${escapeHtml(result.branch)}</code>\nSHA: <code>${escapeHtml(result.commitSha)}</code>${result.idempotent ? '\nوضعیت: <b>reconciled / idempotent</b>' : ''}\n\nشاخهٔ پیش‌فرض تغییر نکرده است.`,
    reply_markup: { inline_keyboard: rows }
  };
}

export function createWorkspaceController({ github, workspaces, editorUrl = DEFAULT_CONFIG.workspaceEditorUrl } = {}) {
  if (!github) throw new Error('Workspace controller requires GitHub service');
  if (!workspaces) throw new Error('Workspace controller requires durable workspace store');

  const requireWorkspace = async (workspaceId, ownerId) => {
    const workspace = await workspaces.getWorkspace({ ownerId, workspaceId });
    if (!workspace) throw new Error('Workspace not found or expired');
    return workspace;
  };

  const renderDirectory = async (repoId, path, ownerId) => {
    const [repo, items] = await Promise.all([
      github.getRepository(repoId),
      github.listFiles(repoId, path)
    ]);
    const visible = items.slice(0, 30);
    const handles = await workspaces.createNavigationRefs({
      ownerId,
      refs: visible.map(item => ({ repoId, path: item.path, type: item.type, sha: item.sha }))
    });
    const body = visible.length
      ? visible.map(item => `${item.type === 'dir' ? '📁' : '📄'} <code>${escapeHtml(short(item.name, 100))}</code>${item.type === 'file' && item.size ? ` (${Number(item.size).toLocaleString()} B)` : ''}`).join('\n')
      : '<i>این پوشه خالی است.</i>';
    const rows = visible.map((item, index) => [{
      text: `${item.type === 'dir' ? '📁' : '📄'} ${short(item.name, 46)}`,
      callback_data: `wnav:${handles[index].refId}`
    }]);
    rows.push([
      { text: '🔄 بروزرسانی', callback_data: `files:${repoId}` },
      { text: '📦 پروژه', callback_data: `repo:${repoId}` }
    ]);
    return {
      text: `📂 <b>فایل‌های ${escapeHtml(repo.name)}</b>\n${path ? `مسیر: <code>${escapeHtml(path)}</code>\n` : ''}➖➖➖➖➖➖➖➖➖➖\n${body}`,
      reply_markup: { inline_keyboard: rows }
    };
  };

  const getPinnedFile = async ref => {
    const repo = await github.getRepository(ref.repoId);
    const snapshot = await github.getBranchSnapshot(ref.repoId, repo.defaultBranch);
    const file = await github.getFileAtRef(ref.repoId, ref.path, snapshot.headSha);
    return { repo, snapshot, file };
  };

  const renderFile = async (refId, ownerId) => {
    const ref = await workspaces.resolveNavigationRef({ ownerId, refId });
    if (!ref || ref.type !== 'file') throw new Error('Workspace file reference is missing or expired');
    const { repo, snapshot, file } = await getPinnedFile(ref);
    const policy = validateEditableFile({ path: file.path, text: file.content, byteLength: file.size });
    const preview = file.content.length > 2600 ? `${file.content.slice(0, 2600)}\n…` : file.content;
    const reason = repo.archived
      ? 'این مخزن آرشیوشده است و ویرایش فایل در آن غیرفعال است.'
      : policy.reason;
    const rows = [];
    if (!repo.archived && policy.editable) rows.push([{ text: '✏️ Edit', callback_data: `wedit:${refId}` }]);
    rows.push([{ text: '🔙 فایل‌ها', callback_data: `files:${ref.repoId}` }, { text: '📦 پروژه', callback_data: `repo:${ref.repoId}` }]);
    return {
      text: `📄 <b>پیش‌نمایش فایل — ${escapeHtml(repo.name)}</b>\nمسیر: <code>${escapeHtml(file.path)}</code>\nRef: <code>${escapeHtml(snapshot.headSha.slice(0, 10))}</code>\n${reason ? `⚠️ ${escapeHtml(reason)}\n` : ''}➖➖➖➖➖➖➖➖➖➖\n<pre>${escapeHtml(preview)}</pre>`,
      reply_markup: { inline_keyboard: rows }
    };
  };

  const createDraft = async (refId, ownerId) => {
    const ref = await workspaces.resolveNavigationRef({ ownerId, refId });
    if (!ref || ref.type !== 'file') throw new Error('Workspace file reference is missing or expired');
    const { repo, snapshot, file } = await getPinnedFile(ref);
    if (repo.archived) throw new Error('Archived repository is not editable');
    const policy = validateEditableFile({ path: file.path, text: file.content, byteLength: file.size });
    if (!policy.editable) throw new Error(policy.reason || 'File is not editable');
    const originalDigest = await digestText(file.content);
    const workspace = await workspaces.createWorkspace({
      ownerId,
      repoId: Number(ref.repoId),
      repoFullName: repo.fullName,
      baseBranch: repo.defaultBranch,
      baseHeadSha: snapshot.headSha,
      baseTreeSha: snapshot.treeSha,
      path: file.path,
      blobSha: file.sha,
      originalText: file.content,
      originalDigest
    });
    return {
      text: `📝 <b>Draft ساخته شد</b>\nمخزن: <code>${escapeHtml(repo.fullName)}</code>\nفایل: <code>${escapeHtml(file.path)}</code>\nBase: <code>${escapeHtml(snapshot.headSha.slice(0, 10))}</code>\n\nهنوز هیچ تغییری در GitHub انجام نشده است.`,
      reply_markup: { inline_keyboard: [[{ text: '📝 باز کردن Draft', callback_data: `ws:${workspace.id}` }], [{ text: '🔙 فایل‌ها', callback_data: `files:${ref.repoId}` }]] }
    };
  };

  const renderWorkspaceObject = async (workspace, ownerId) => {
    const files = Array.isArray(workspace.files) && workspace.files.length ? workspace.files : [{ path: workspace.path, originalText: workspace.originalText, draftText: workspace.draftText }];
    const changedCount = files.filter(file => file.draftText !== file.originalText).length;
    const refs = await workspaces.createNavigationRefs?.({ ownerId, refs: files.map(file => ({ workspaceId: workspace.id, path: file.path, type: 'workspace-file', repoId: workspace.repoId })) }) || [];
    const commitMessage = workspace.commitMessage ? `<code>${escapeHtml(short(workspace.commitMessage, 120))}</code>` : '<i>ثبت نشده</i>';
    const list = files.map((file, i) => `${file.draftText !== file.originalText ? '●' : '○'} <code>${escapeHtml(file.path)}</code>${refs[i]?.refId && files.length > 1 ? ` — <i>قابل حذف</i>` : ''}`).join('\n');
    const buttons = workspaceButtons(workspace, editorUrl);
    buttons.unshift([{ text: '➕ افزودن فایل', callback_data: `wfiles:${workspace.id}:${workspace.repoId}` }]);
    if (files.length > 1 && refs[1]?.refId) buttons.unshift([{ text: `➖ حذف ${short(files[1].path, 28)}`, callback_data: `wremove:${refs[1].refId}` }]);
    return { text: `📝 <b>Repository Workspace</b>\nChange Set: <b>${files.length} فایل</b> · تغییرکرده: <b>${changedCount}</b>\n${list}\nوضعیت: <b>${escapeHtml(workspace.state || 'DRAFT')}</b>\nBase: <code>${escapeHtml(String(workspace.baseHeadSha || '').slice(0, 10))}</code>\nپیام Commit: ${commitMessage}\n\nذخیره فقط Draft محلی را تغییر می‌دهد؛ GitHub فقط بعد از Diff، Ready و Safe Approval تغییر می‌کند.`, reply_markup:{inline_keyboard:buttons} };
  };

  const renderWorkspace = async (workspaceId, ownerId) => renderWorkspaceObject(await requireWorkspace(workspaceId, ownerId), ownerId);

  const pickWorkspaceFile = async (workspaceId, repoId, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    if (Number(workspace.repoId) !== Number(repoId)) throw new Error('Workspace repository mismatch');
    const existingPaths = new Set((Array.isArray(workspace.files) && workspace.files.length ? workspace.files : [{ path: workspace.path }]).map(file => file.path));
    const items = (await github.listFiles(repoId, '')).filter(item => item.type === 'file' && !existingPaths.has(item.path)).slice(0, 20);
    const refs = await workspaces.createNavigationRefs({ ownerId, refs: items.map(item => ({ repoId, workspaceId, path:item.path, type:'workspace-add', sha:item.sha })) });
    return { text:`➕ <b>افزودن فایل به Change Set</b>\n${items.length ? 'یک فایل را انتخاب کنید.' : 'فایل قابل افزودن دیگری در این نما نیست.'}`, reply_markup:{inline_keyboard:items.map((item,i)=>[{text:`📄 ${short(item.path,42)}`,callback_data:`wadd:${refs[i].refId}`}]).concat([[{text:'↩️ Workspace',callback_data:`ws:${workspaceId}`} ]])} };
  };

  const addWorkspaceFile = async (refId, ownerId) => {
    const ref = await workspaces.resolveNavigationRef({ownerId,refId});
    if (!ref || ref.type !== 'workspace-add') throw new Error('Workspace add-file reference is missing or expired');
    const workspace = await requireWorkspace(ref.workspaceId, ownerId);
    const file = await github.getFileAtRef(ref.repoId, ref.path, workspace.baseHeadSha);
    const policy = validateEditableFile({path:file.path,text:file.content,byteLength:file.size});
    if (!policy.editable) throw new Error(policy.reason || 'File is not editable');
    const digest = await digestText(file.content);
    const updated = await workspaces.upsertWorkspaceFile({ownerId,workspaceId:workspace.id,file:{path:file.path,blobSha:file.sha,originalText:file.content,originalDigest:digest,draftText:file.content,draftDigest:digest}});
    const view = await renderWorkspaceObject(updated, ownerId); view.text = `✅ فایل <code>${escapeHtml(file.path)}</code> اضافه شد.\n\n${view.text}`; return view;
  };

  const removeWorkspaceFile = async (refId, ownerId) => {
    const ref=await workspaces.resolveNavigationRef({ownerId,refId});
    if(!ref || ref.type!=='workspace-file') throw new Error('Workspace file reference is missing or expired');
    const updated=await workspaces.removeWorkspaceFile({ownerId,workspaceId:ref.workspaceId,path:ref.path});
    return renderWorkspaceObject(updated,ownerId);
  };

  const prepareInput = async (workspaceId, mode, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    await workspaces.setPendingInput({ ownerId, workspaceId, mode });
    const fileMode = mode === 'draft_file';
    const draftMode = mode === 'draft';
    return {
      text: fileMode
        ? `📎 <b>فایل متنی جایگزین را ارسال کنید</b>\nمقصد در مخزن: <code>${escapeHtml(workspace.path)}</code>\n\nفایل ارسال‌شده فقط به‌عنوان محتوای جایگزین Draft استفاده می‌شود؛ نام فایل مقصد را تغییر نمی‌دهد. سقف Policy: 20,000 کاراکتر Unicode و 65,536 بایت UTF-8 معتبر. فایل‌های باینری، LFS یا محتوای غیرمجاز رد می‌شوند.`
        : draftMode
          ? `📝 <b>ورودی متنی قدیمی Workspace</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\n\nاین مسیر فقط برای سازگاری پیام‌های قدیمی باقی مانده است. Editor جدید مسیر اصلی است. سقف: 20,000 کاراکتر Unicode و 65,536 بایت UTF-8.`
          : `✍️ <b>پیام Commit را ارسال کنید</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\n\nپیام باید غیرخالی و حداکثر 120 کاراکتر باشد. پیام بعدی فقط یک‌بار مصرف می‌شود.`,
      reply_markup: { inline_keyboard: [[{ text: '↩️ بازگشت به Draft', callback_data: `ws:${workspace.id}` }]] }
    };
  };

  const applyPendingInput = async ({ pending, text, file }, ownerId) => {
    const workspaceId = String(pending?.workspaceId || '');
    const mode = String(pending?.mode || '');
    if (!new RegExp(`^${HANDLE_10}$`).test(workspaceId) || !['draft', 'draft_file', 'commit_message'].includes(mode)) {
      throw new Error('Pending workspace input is invalid');
    }

    if (mode === 'draft_file' && (!file || typeof file.text !== 'string')) {
      throw new Error('A UTF-8 Telegram document is required for this workspace input');
    }

    const consumed = await workspaces.consumePendingInput({ ownerId, workspaceId, mode });
    if (!consumed) throw new Error('Pending workspace input was already consumed or expired');
    const workspace = await requireWorkspace(workspaceId, ownerId);

    if (mode === 'draft' || mode === 'draft_file') {
      const inputText = mode === 'draft_file' ? file.text : text;
      const inputBytes = mode === 'draft_file' ? Number(file.byteLength) : undefined;
      const policy = validateEditableFile({ path: workspace.path, text: inputText, byteLength: inputBytes });
      if (!policy.editable) {
        return {
          text: `⚠️ <b>Draft تغییر نکرد</b>\n${escapeHtml(policy.reason || 'محتوای ارسال‌شده مجاز نیست.')}\n\nاین ورودی مصرف شد؛ برای تلاش دوباره ${mode === 'draft_file' ? '«بارگذاری فایل»' : 'Editor'} را باز کنید.`,
          reply_markup: { inline_keyboard: [[{ text: '📝 بازگشت به Draft', callback_data: `ws:${workspace.id}` }]] }
        };
      }
      const digest = await digestText(policy.text);
      const updated = await workspaces.updateDraft({ ownerId, workspaceId, text: policy.text, digest });
      const source = mode === 'draft_file'
        ? `\nفایل ورودی: <code>${escapeHtml(short(file.name || 'uploaded file', 100))}</code>`
        : '';
      return {
        text: `✅ <b>Draft محلی ذخیره شد</b>\nفایل مقصد: <code>${escapeHtml(updated.path)}</code>${source}\nکاراکتر: <b>${policy.charLength}</b> · بایت UTF-8: <b>${policy.byteLength}</b>\n\nهنوز هیچ تغییری در GitHub انجام نشده است.`,
        reply_markup: { inline_keyboard: workspaceButtons(updated, editorUrl) }
      };
    }

    let message;
    try {
      message = normalizeCommitMessage(text);
    } catch (error) {
      return {
        text: `⚠️ <b>پیام Commit ذخیره نشد</b>\n${escapeHtml(error?.message || 'Commit message is invalid')}\n\nاین ورودی مصرف شد؛ برای تلاش دوباره «پیام Commit» را بزنید.`,
        reply_markup: { inline_keyboard: [[{ text: '📝 بازگشت به Draft', callback_data: `ws:${workspace.id}` }]] }
      };
    }
    const digest = await digestText(message);
    const updated = await workspaces.setCommitMessage({ ownerId, workspaceId, message, digest });
    return {
      text: `✅ <b>پیام Commit ذخیره شد</b>\n<code>${escapeHtml(message)}</code>\n\nهنوز هیچ تغییری در GitHub انجام نشده است.`,
      reply_markup: { inline_keyboard: workspaceButtons(updated, editorUrl) }
    };
  };

  const renderDiff = async (workspaceId, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    const files = Array.isArray(workspace.files) && workspace.files.length ? workspace.files : [{path:workspace.path,originalText:workspace.originalText,draftText:workspace.draftText}];
    const changed = files.filter(file => file.draftText !== file.originalText);
    const diffs = changed.map(file => ({file,diff:buildUnifiedDiff({path:file.path,before:file.originalText,after:file.draftText,maxChars:Math.max(500,Math.floor(2200/Math.max(1,changed.length)))})}));
    const additions=diffs.reduce((n,x)=>n+x.diff.additions,0), deletions=diffs.reduce((n,x)=>n+x.diff.deletions,0);
    const body=diffs.length ? diffs.map(({file,diff})=>`<b>${escapeHtml(file.path)}</b> · +${diff.additions}/-${diff.deletions}${diff.truncated?' ⚠️':''}\n<pre>${escapeHtml(diff.text)}</pre>`).join('\n') : '<i>هیچ تغییر محلی وجود ندارد.</i>';
    return { text:`🔍 <b>Diff تجمیعی Change Set</b>\n${changed.length} فایل تغییرکرده · +${additions} / -${deletions}\n➖➖➖➖➖➖➖➖➖➖\n${body}`, reply_markup:{inline_keyboard:[[{text:'📝 Draft',callback_data:`ws:${workspace.id}`},{text:'✅ آماده Commit',callback_data:`wready:${workspace.id}`}]]} };
  };

  const sealReadyIntent = async (workspaceId, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    const workspaceFiles = Array.isArray(workspace.files) && workspace.files.length ? workspace.files : null;
    const changedFiles = workspaceFiles ? workspaceFiles.filter(file => file.draftText !== file.originalText) : null;
    if (workspaceFiles ? changedFiles.length === 0 : workspace.draftText === workspace.originalText) throw new Error('No draft change to commit');
    const commitMessage = normalizeCommitMessage(workspace.commitMessage);
    const commitMessageDigest = await digestText(commitMessage);
    const targetBranch = makeTargetBranch(workspace.id);
    const createdAt = Number(workspace.createdAt);
    const commitTimestamp = new Date(Number.isFinite(createdAt) ? createdAt : 0).toISOString();
    const fileDescriptors = workspaceFiles ? await Promise.all(workspaceFiles.map(async file => ({ path:file.path, sourceBlobSha:file.blobSha, contentDigest:file.draftDigest || await digestText(file.draftText) }))) : null;
    const material = workspaceFiles ? {
      repoId:Number(workspace.repoId), workspaceId:workspace.id, baseBranch:workspace.baseBranch, baseHeadSha:workspace.baseHeadSha, baseTreeSha:workspace.baseTreeSha,
      files:fileDescriptors, commitMessageDigest, targetBranch, commitTimestamp
    } : {
      repoId: Number(workspace.repoId),
      workspaceId: workspace.id,
      baseBranch: workspace.baseBranch,
      baseHeadSha: workspace.baseHeadSha,
      baseTreeSha: workspace.baseTreeSha,
      path: workspace.path,
      sourceBlobSha: workspace.blobSha,
      contentDigest: await digestText(workspace.draftText),
      commitMessageDigest,
      targetBranch,
      commitTimestamp
    };
    const intentDigest = await digestText(JSON.stringify(material));
    const intent = await workspaces.sealIntent({
      ownerId,
      workspaceId,
      intent: { ...material, intentDigest }
    });
    if (!intent?.id || !/^[A-Za-z0-9_-]{8}$/.test(intent.id)) throw new Error('Commit intent ID is invalid');
    return {
      text: `✅ <b>آمادهٔ تأیید Commit</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\nBranch: <code>${escapeHtml(targetBranch)}</code>\nBase: <code>${escapeHtml(String(workspace.baseHeadSha).slice(0, 10))}</code>\n\nمرحلهٔ بعد فقط درخواست تأیید امن را می‌سازد؛ تا تأیید معتبر مصرف نشود GitHub WRITE اجرا نمی‌شود.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ تأیید و Commit', callback_data: `wscommit:${workspace.repoId}:${intent.id}` }],
          [{ text: '🔍 Diff', callback_data: `wdiff:${workspace.id}` }, { text: '📝 Draft', callback_data: `ws:${workspace.id}` }]
        ]
      }
    };
  };

  const cancelDraft = async (workspaceId, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    await workspaces.cancelWorkspace({ ownerId, workspaceId });
    return {
      text: `🗑 <b>Draft لغو شد</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\nهیچ تغییری در GitHub انجام نشد.`,
      reply_markup: { inline_keyboard: [[{ text: '🔙 فایل‌ها', callback_data: `files:${workspace.repoId}` }]] }
    };
  };

  return {
    resolveCallback(data, context = {}) {
      const parsed = parseCallback(data);
      if (!parsed) return null;

      if (parsed.kind === 'commit') {
        return {
          actionId: parsed.actionId,
          approval: {
            input: { repoId: parsed.repoId, intentId: parsed.intentId },
            label: 'Commit روی branch جدید',
            cancelCallback: `repo:${parsed.repoId}`
          },
          audit: { repoId: parsed.repoId, intentId: parsed.intentId },
          execute: async () => {
            const ownerId = ownerFrom(context);
            const result = await commitWorkspaceIntent({
              github,
              workspaces,
              ownerId,
              repoId: parsed.repoId,
              intentId: parsed.intentId
            });
            const intent = await workspaces.getIntent({ ownerId, intentId: parsed.intentId });
            const view = workspaceCommitResultView(parsed.repoId, intent, result);
            return {
              ...view,
              audit: {
                repoId: parsed.repoId,
                intentId: parsed.intentId,
                workspaceId: intent?.workspaceId,
                path: intent?.path,
                contentDigest: intent?.contentDigest,
                commitMessageDigest: intent?.commitMessageDigest,
                baseHeadSha: intent?.baseHeadSha,
                targetBranch: intent?.targetBranch,
                commitSha: result.commitSha,
                branch: result.branch,
                idempotent: result.idempotent
              }
            };
          }
        };
      }

      return {
        actionId: parsed.actionId,
        execute: async () => {
          const ownerId = ownerFrom(context);
          if (parsed.kind === 'root') return renderDirectory(parsed.repoId, '', ownerId);
          if (parsed.kind === 'workspace') return renderWorkspace(parsed.workspaceId, ownerId);
          if (parsed.kind === 'pick_file') return pickWorkspaceFile(parsed.workspaceId, parsed.repoId, ownerId);
          if (parsed.kind === 'add_file') return addWorkspaceFile(parsed.refId, ownerId);
          if (parsed.kind === 'remove_file') return removeWorkspaceFile(parsed.refId, ownerId);
          if (parsed.kind === 'edit') return createDraft(parsed.refId, ownerId);
          if (parsed.kind === 'input') return prepareInput(parsed.workspaceId, parsed.mode, ownerId);
          if (parsed.kind === 'diff') return renderDiff(parsed.workspaceId, ownerId);
          if (parsed.kind === 'ready') return sealReadyIntent(parsed.workspaceId, ownerId);
          if (parsed.kind === 'cancel') return cancelDraft(parsed.workspaceId, ownerId);
          const ref = await workspaces.resolveNavigationRef({ ownerId, refId: parsed.refId });
          if (!ref) throw new Error('Workspace navigation reference is missing or expired');
          return ref.type === 'dir'
            ? renderDirectory(ref.repoId, ref.path, ownerId)
            : renderFile(parsed.refId, ownerId);
        }
      };
    },

    resolveMessage(payload, context = {}) {
      const pending = payload?.pending;
      if (!pending || !['draft', 'draft_file', 'commit_message'].includes(String(pending.mode || ''))) return null;
      if (!new RegExp(`^${HANDLE_10}$`).test(String(pending.workspaceId || ''))) return null;
      return {
        actionId: 'github.workspace.input.apply',
        execute: async () => applyPendingInput({
          pending,
          text: String(payload?.text ?? ''),
          file: payload?.file && typeof payload.file === 'object' ? payload.file : null
        }, ownerFrom(context))
      };
    }
  };
}
