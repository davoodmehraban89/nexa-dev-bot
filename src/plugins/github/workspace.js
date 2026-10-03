import {
  buildUnifiedDiff,
  digestText,
  makeTargetBranch,
  normalizeCommitMessage,
  validateEditableFile
} from '../../core/workspace-policy.js';
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

function workspaceButtons(workspace) {
  return [
    [
      { text: '📎 بارگذاری فایل', callback_data: `wfile:${workspace.id}` },
      { text: '📝 Paste متن', callback_data: `wtext:${workspace.id}` }
    ],
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

export function createWorkspaceController({ github, workspaces } = {}) {
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

  const renderWorkspace = async (workspaceId, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    const changed = workspace.draftText !== workspace.originalText;
    const commitMessage = workspace.commitMessage
      ? `<code>${escapeHtml(short(workspace.commitMessage, 120))}</code>`
      : '<i>ثبت نشده</i>';
    return {
      text: `📝 <b>Repository Workspace</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\nوضعیت: <b>${escapeHtml(workspace.state || 'DRAFT')}</b>\nBase: <code>${escapeHtml(String(workspace.baseHeadSha || '').slice(0, 10))}</code>\nتغییر محلی: <b>${changed ? 'دارد' : 'ندارد'}</b>\nپیام Commit: ${commitMessage}\n\nروش پیشنهادی: فایل متنی جایگزین را بارگذاری کنید؛ Paste متن همچنان به‌عنوان مسیر جایگزین در دسترس است. تا قبل از تأیید نهایی، هیچ تغییری در GitHub انجام نمی‌شود.`,
      reply_markup: { inline_keyboard: workspaceButtons(workspace) }
    };
  };

  const prepareInput = async (workspaceId, mode, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    await workspaces.setPendingInput({ ownerId, workspaceId, mode });
    const fileMode = mode === 'draft_file';
    const draftMode = mode === 'draft';
    return {
      text: fileMode
        ? `📎 <b>فایل متنی جایگزین را ارسال کنید</b>\nمقصد در مخزن: <code>${escapeHtml(workspace.path)}</code>\n\nفایل ارسال‌شده فقط به‌عنوان محتوای جایگزین Draft استفاده می‌شود؛ نام فایل مقصد را تغییر نمی‌دهد. سقف: 3,000 کاراکتر Unicode و 12,000 بایت UTF-8 معتبر. فایل‌های باینری، LFS یا محتوای غیرمجاز رد می‌شوند.`
        : draftMode
          ? `📝 <b>متن جدید Draft را ارسال کنید</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\n\nکل محتوای فایل جایگزین می‌شود. سقف: 3,000 کاراکتر Unicode و 12,000 بایت UTF-8. پیام بعدی فقط یک‌بار مصرف می‌شود.`
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
          text: `⚠️ <b>Draft تغییر نکرد</b>\n${escapeHtml(policy.reason || 'محتوای ارسال‌شده مجاز نیست.')}\n\nاین ورودی مصرف شد؛ برای تلاش دوباره ${mode === 'draft_file' ? '«بارگذاری فایل»' : '«Paste متن»'} را بزنید.`,
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
        reply_markup: { inline_keyboard: workspaceButtons(updated) }
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
      reply_markup: { inline_keyboard: workspaceButtons(updated) }
    };
  };

  const renderDiff = async (workspaceId, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    const diff = buildUnifiedDiff({
      path: workspace.path,
      before: workspace.originalText,
      after: workspace.draftText,
      maxChars: 2400
    });
    const truncation = diff.truncated ? '\n⚠️ نمایش Diff کوتاه شده؛ شمارش‌ها بر اساس محتوای کامل هستند.' : '';
    return {
      text: `🔍 <b>Diff محلی</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\n+${diff.additions} / -${diff.deletions}${truncation}\n➖➖➖➖➖➖➖➖➖➖\n<pre>${escapeHtml(diff.text)}</pre>`,
      reply_markup: { inline_keyboard: [[{ text: '📝 Draft', callback_data: `ws:${workspace.id}` }, { text: '✅ آماده Commit', callback_data: `wready:${workspace.id}` }]] }
    };
  };

  const sealReadyIntent = async (workspaceId, ownerId) => {
    const workspace = await requireWorkspace(workspaceId, ownerId);
    if (workspace.draftText === workspace.originalText) throw new Error('No draft change to commit');
    const commitMessage = normalizeCommitMessage(workspace.commitMessage);
    const contentDigest = await digestText(workspace.draftText);
    const commitMessageDigest = await digestText(commitMessage);
    const targetBranch = makeTargetBranch(workspace.id);
    const createdAt = Number(workspace.createdAt);
    const commitTimestamp = new Date(Number.isFinite(createdAt) ? createdAt : 0).toISOString();
    const material = {
      repoId: Number(workspace.repoId),
      workspaceId: workspace.id,
      baseBranch: workspace.baseBranch,
      baseHeadSha: workspace.baseHeadSha,
      baseTreeSha: workspace.baseTreeSha,
      path: workspace.path,
      sourceBlobSha: workspace.blobSha,
      contentDigest,
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
