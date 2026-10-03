import { digestText, validateEditableFile } from '../../core/workspace-policy.js';

const HANDLE_10 = '[A-Za-z0-9_-]{10}';
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
  return null;
}

export function createWorkspaceController({ github, workspaces } = {}) {
  if (!github) throw new Error('Workspace controller requires GitHub service');
  if (!workspaces) throw new Error('Workspace controller requires durable workspace store');

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
      { text: '🔄 بروزرسانی', callback_data: path ? `files:${repoId}` : `files:${repoId}` },
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
    const workspace = await workspaces.getWorkspace({ ownerId, workspaceId });
    if (!workspace) throw new Error('Workspace not found or expired');
    return {
      text: `📝 <b>Repository Workspace</b>\nفایل: <code>${escapeHtml(workspace.path)}</code>\nوضعیت: <b>${escapeHtml(workspace.state || 'DRAFT')}</b>\nBase: <code>${escapeHtml(String(workspace.baseHeadSha || '').slice(0, 10))}</code>`,
      reply_markup: { inline_keyboard: [[{ text: '🔙 فایل‌ها', callback_data: `files:${workspace.repoId}` }]] }
    };
  };

  return {
    resolveCallback(data, context = {}) {
      const parsed = parseCallback(data);
      if (!parsed) return null;
      return {
        actionId: parsed.actionId,
        execute: async () => {
          const ownerId = ownerFrom(context);
          if (parsed.kind === 'root') return renderDirectory(parsed.repoId, '', ownerId);
          if (parsed.kind === 'workspace') return renderWorkspace(parsed.workspaceId, ownerId);
          if (parsed.kind === 'edit') return createDraft(parsed.refId, ownerId);
          const ref = await workspaces.resolveNavigationRef({ ownerId, refId: parsed.refId });
          if (!ref) throw new Error('Workspace navigation reference is missing or expired');
          return ref.type === 'dir'
            ? renderDirectory(ref.repoId, ref.path, ownerId)
            : renderFile(parsed.refId, ownerId);
        }
      };
    }
  };
}
