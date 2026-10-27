import { validateTelegramWebAppInitData } from './core/telegram-webapp-auth.js';
import { readBoundedJson } from './core/bounded-json.js';
import {
  WORKSPACE_EDITOR_LIMITS,
  buildWorkspaceDiff,
  digestText,
  normalizeCommitMessage,
  validateEditableFile
} from './core/workspace-policy.js';
import { createWorkspaceController } from './plugins/github/workspace.js';
import { RELEASE_VERSION } from './version.js';

const PREFIX = '/api/v1/studio';
const HANDLE = /^[A-Za-z0-9_-]{10}$/;
const INTENT = /^[A-Za-z0-9_-]{8}$/;
const encoder = new TextEncoder();

class StudioError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const response = (payload, status = 200) =>
  Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });

function handle(value) {
  if (typeof value !== 'string' || !HANDLE.test(value))
    throw new StudioError(400, 'شناسه معتبر نیست.');
  return value;
}

function repositoryId(value) {
  if (
    !/^[1-9][0-9]*$/.test(String(value ?? '')) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new StudioError(400, 'شناسه مخزن معتبر نیست.');
  return String(value);
}

function filePath(value, { allowRoot = false } = {}) {
  if (allowRoot && (value === '' || value === null)) return '';
  if (
    typeof value !== 'string' ||
    value.length > 1024 ||
    value.includes('\\') ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0);
      return code < 32 || code === 127;
    }) ||
    value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new StudioError(400, 'مسیر فایل معتبر نیست.');
  return value;
}

async function readBody(
  request,
  allowedKeys,
  maxBytes = 4096,
  allowEmpty = false
) {
  if (!request.body && allowEmpty) return {};
  let body;
  try {
    body = await readBoundedJson(request, maxBytes);
  } catch (error) {
    if (error instanceof RangeError)
      throw new StudioError(413, 'حجم درخواست بیش از حد مجاز است.');
    if (error instanceof SyntaxError)
      throw new StudioError(400, 'درخواست JSON معتبر نیست.');
    throw error;
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowedKeys.includes(key))
  )
    throw new StudioError(400, 'فیلدهای درخواست معتبر نیستند.');
  return body;
}

function filesOf(workspace) {
  return Array.isArray(workspace.files) && workspace.files.length
    ? workspace.files
    : [
        {
          path: workspace.path,
          draftText: workspace.draftText,
          originalText: workspace.originalText,
          revision: workspace.revision ?? 0
        }
      ];
}

function workspaceDto(workspace) {
  return {
    id: workspace.id,
    repoId: String(workspace.repoId),
    repoFullName: workspace.repoFullName,
    baseBranch: workspace.baseBranch,
    baseHeadSha: workspace.baseHeadSha,
    state: workspace.state || 'DRAFT',
    path: workspace.path,
    files: filesOf(workspace).map((file) => ({
      path: file.path,
      draftText: file.draftText,
      revision: file.revision ?? 0
    })),
    commitMessage: workspace.commitMessage || '',
    ...(workspace.commitSha && workspace.branch
      ? { result: { commitSha: workspace.commitSha, branch: workspace.branch } }
      : {})
  };
}

const workspaceResponse = (workspace) =>
  response({
    ok: true,
    workspace: workspaceDto(workspace),
    limits: WORKSPACE_EDITOR_LIMITS
  });

async function requireWorkspace(workspaces, ownerId, workspaceId) {
  const workspace = await workspaces.getWorkspace({ ownerId, workspaceId });
  if (!workspace)
    throw new StudioError(404, 'فضای کار پیدا نشد یا منقضی شده است.');
  return workspace;
}

function assertEditable(workspace) {
  if (['COMMITTING', 'COMMITTED'].includes(workspace.state))
    throw new StudioError(409, 'این فضای کار اکنون قابل ویرایش نیست.');
}

function expectedRevision(request) {
  const value = request.headers.get('if-match');
  if (value === null)
    throw new StudioError(428, 'نسخه فایل برای ذخیره الزامی است.');
  const match = value.match(/^(?:"(0|[1-9][0-9]*)"|(0|[1-9][0-9]*))$/);
  const revision = match ? Number(match[1] ?? match[2]) : NaN;
  if (!Number.isSafeInteger(revision))
    throw new StudioError(400, 'نسخه فایل معتبر نیست.');
  return revision;
}

function reviewOf(workspace) {
  return {
    baseHeadSha: workspace.baseHeadSha,
    files: filesOf(workspace).map((file) => ({
      path: file.path,
      revision: file.revision ?? 0
    }))
  };
}

function validateReview(review) {
  if (
    !review ||
    typeof review !== 'object' ||
    Array.isArray(review) ||
    Object.keys(review).some(
      (key) => !['baseHeadSha', 'files'].includes(key)
    ) ||
    typeof review.baseHeadSha !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(review.baseHeadSha) ||
    !Array.isArray(review.files) ||
    !review.files.length ||
    review.files.length > WORKSPACE_EDITOR_LIMITS.maxFiles
  )
    throw new StudioError(400, 'ابتدا Diff فعلی را بازبینی کنید.');
  const paths = new Set();
  for (const file of review.files) {
    if (
      !file ||
      typeof file !== 'object' ||
      Array.isArray(file) ||
      Object.keys(file).some((key) => !['path', 'revision'].includes(key)) ||
      !Number.isSafeInteger(file.revision) ||
      file.revision < 0
    )
      throw new StudioError(400, 'نسخه بازبینی Diff معتبر نیست.');
    filePath(file.path);
    if (paths.has(file.path))
      throw new StudioError(400, 'نسخه بازبینی Diff معتبر نیست.');
    paths.add(file.path);
  }
  return review;
}

function assertAggregate(files) {
  if (
    files.length > WORKSPACE_EDITOR_LIMITS.maxFiles ||
    files.reduce(
      (total, file) =>
        total +
        Math.max(
          encoder.encode(file.originalText ?? '').byteLength,
          encoder.encode(file.draftText ?? '').byteLength
        ),
      0
    ) > WORKSPACE_EDITOR_LIMITS.maxAggregateBytes
  )
    throw new StudioError(
      422,
      'حجم یا تعداد فایل‌های فضای کار بیش از حد مجاز است.'
    );
}

async function provider(operation) {
  try {
    return await operation();
  } catch {
    throw new StudioError(
      502,
      'ارتباط با سرویس مخزن برقرار نشد. دوباره تلاش کنید.'
    );
  }
}

function controllerError(error) {
  if (error instanceof StudioError) return error;
  if (error?.code === 'REVISION_CONFLICT') return error;
  if (error?.code === 'WORKSPACE_NOT_EDITABLE')
    return new StudioError(409, 'این فضای کار اکنون قابل ویرایش نیست.');
  if (error?.code === 'WORKSPACE_LIMIT_EXCEEDED')
    return new StudioError(
      422,
      'حجم یا تعداد فایل‌های فضای کار بیش از حد مجاز است.'
    );
  const message = String(error?.message || '');
  if (/reference.*(?:missing|expired)|not found or expired/i.test(message))
    return new StudioError(404, 'مرجع یا فضای کار پیدا نشد یا منقضی شده است.');
  if (/repository mismatch|reference mismatch|already exists/i.test(message))
    return new StudioError(400, 'مرجع فایل با فضای کار مطابقت ندارد.');
  if (/limited|not editable|binary|LFS|sensitive|aggregate size/i.test(message))
    return new StudioError(422, 'این فایل یا اندازه آن برای ویرایش مجاز نیست.');
  if (/No draft change|Commit message.*(?:required|120)/i.test(message))
    return new StudioError(422, 'تغییر فایل و پیام Commit معتبر الزامی است.');
  return new StudioError(502, 'عملیات فضای کار انجام نشد. دوباره تلاش کنید.');
}

async function controllerOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    throw controllerError(error);
  }
}

async function requestApproval({
  ownerId,
  workspaceId,
  review,
  controller,
  bot
}) {
  if (
    !bot?.router?.dispatchCallback ||
    !bot.approvals?.isReplayProtected?.() ||
    !bot.telegram?.sendMessage
  )
    throw new StudioError(503, 'تأیید امن در دسترس نیست.');
  const { workspace, intent } = await controllerOperation(() =>
    controller.sealWorkspaceIntent({ ownerId, workspaceId, review })
  );
  if (
    !intent ||
    !INTENT.test(String(intent.id || '')) ||
    intent.workspaceId !== workspaceId ||
    intent.state !== 'READY' ||
    Number(intent.repoId) !== Number(workspace.repoId)
  )
    throw new StudioError(409, 'فضای کار برای تأیید آماده نیست.');
  const routed = await bot.router.dispatchCallback(
    `wscommit:${workspace.repoId}:${intent.id}`,
    { isOwner: true, ownerId }
  );
  if (
    routed?.requiresApproval !== true ||
    routed.pluginId !== 'github' ||
    routed.actionId !== 'github.workspace.commit_branch' ||
    routed.risk !== 'WRITE' ||
    Number(routed.approval?.input?.repoId) !== Number(workspace.repoId) ||
    routed.approval?.input?.intentId !== intent.id
  )
    throw new StudioError(503, 'درخواست تأیید امن پذیرفته نشد.');
  const token = await bot.approvals.issue({
    pluginId: routed.pluginId,
    actionId: routed.actionId,
    risk: routed.risk,
    ownerId,
    input: routed.approval.input
  });
  const approval = await bot.approvals.verify(token, {
    ownerId,
    pluginId: 'github',
    actionId: 'github.workspace.commit_branch',
    risk: 'WRITE'
  });
  await bot.telegram.sendMessage(
    ownerId,
    `⚠️ تأیید نهایی Commit روی شاخه جدید لازم است.\nBranch: <code>${intent.targetBranch}</code>\nBase: <code>${intent.baseHeadSha}</code>\n\nاین تأیید فقط برای نسخه بررسی‌شده و یک‌بار معتبر است.`,
    {
      inline_keyboard: [
        [{ text: '✅ تأیید و Commit', callback_data: `approve:${token}` }],
        [{ text: '↩️ انصراف', callback_data: `repo:${workspace.repoId}` }]
      ]
    }
  );
  return response({
    ok: true,
    approvalRequested: true,
    workspaceId,
    targetBranch: intent.targetBranch,
    baseHeadSha: intent.baseHeadSha,
    expiresAt: approval.expiresAt
  });
}

export async function handleStudioApiRequest(
  request,
  { env = {}, github, workspaces, bot, now = () => Date.now() } = {}
) {
  const url = new URL(request.url);
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`))
    return null;
  try {
    const ownerId = String(env.OWNER_TELEGRAM_ID || '');
    if (
      !/^[1-9][0-9]*$/.test(ownerId) ||
      !Number.isSafeInteger(Number(ownerId)) ||
      !env.TELEGRAM_BOT_TOKEN
    )
      throw new StudioError(503, 'پیکربندی ورود امن کامل نیست.');
    let identity;
    try {
      const initData = request.headers.get('x-telegram-init-data') || '';
      if (initData.length > 8192) throw new Error('Invalid initData');
      identity = await validateTelegramWebAppInitData(initData, {
        botToken: env.TELEGRAM_BOT_TOKEN,
        ownerId,
        now,
        maxAgeSeconds: 3600
      });
    } catch {
      throw new StudioError(
        403,
        'این برنامه را از حساب مالک در تلگرام باز کنید.'
      );
    }

    const route = url.pathname.slice(PREFIX.length);
    if (request.method === 'GET' && route === '')
      return response({
        ok: true,
        user: {
          name: String(
            identity.user.first_name || identity.user.username || 'مالک'
          )
        },
        limits: WORKSPACE_EDITOR_LIMITS,
        version: RELEASE_VERSION
      });
    if (request.method === 'GET' && route === '/repos') {
      const repositories = await provider(() => github.listRepositories());
      return response({
        ok: true,
        repositories: repositories.map((repo) => ({
          id: String(repo.id),
          name: repo.name,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          private: Boolean(repo.private),
          ...(repo.description ? { description: repo.description } : {})
        }))
      });
    }
    if (!github || !workspaces)
      throw new StudioError(503, 'سرویس فضای کار در دسترس نیست.');
    const controller = createWorkspaceController({ github, workspaces });
    if (request.method === 'GET' && route === '/tree') {
      const repoId = repositoryId(url.searchParams.get('repoId'));
      const path = filePath(url.searchParams.get('path'), { allowRoot: true });
      const workspaceId = url.searchParams.get('workspaceId');
      let workspace;
      if (workspaceId !== null) {
        workspace = await requireWorkspace(
          workspaces,
          ownerId,
          handle(workspaceId)
        );
        if (String(workspace.repoId) !== repoId)
          throw new StudioError(400, 'مخزن با فضای کار مطابقت ندارد.');
      }
      const [repository, items] = await provider(() =>
        Promise.all([
          github.getRepository(repoId),
          github.listFiles(
            repoId,
            path,
            workspace ? { ref: workspace.baseHeadSha } : {}
          )
        ])
      );
      const refs = await workspaces.createNavigationRefs({
        ownerId,
        refs: items.map((item) => ({
          repoId: Number(repoId),
          path: item.path,
          sha: item.sha,
          type: workspace && item.type === 'file' ? 'workspace-add' : item.type,
          ...(workspace && item.type === 'file'
            ? { workspaceId: workspace.id }
            : {})
        }))
      });
      return response({
        ok: true,
        repository: {
          id: String(repository.id),
          fullName: repository.fullName,
          defaultBranch: repository.defaultBranch
        },
        path,
        items: items.map((item, i) => ({
          refId: refs[i].refId,
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size ?? 0
        }))
      });
    }
    if (request.method === 'POST' && route === '/workspaces') {
      const body = await readBody(request, ['refId']);
      const workspace = await controllerOperation(() =>
        controller.createWorkspaceFromRef({
          ownerId,
          refId: handle(body.refId)
        })
      );
      return workspaceResponse(workspace);
    }
    const match = route.match(
      /^\/workspaces\/([^/]+)(?:\/(files|diff|message|approval))?$/
    );
    if (!match) throw new StudioError(404, 'مسیر پیدا نشد.');
    const workspaceId = handle(match[1]);
    const action = match[2] || '';
    const workspace = await requireWorkspace(workspaces, ownerId, workspaceId);
    if (request.method === 'GET' && action === '')
      return workspaceResponse(workspace);
    if (request.method === 'GET' && action === 'diff')
      return response({
        ok: true,
        diff: buildWorkspaceDiff({
          files: filesOf(workspace),
          maxChars: 10000
        }),
        review: reviewOf(workspace)
      });
    if (request.method === 'DELETE' && action === '') {
      await workspaces.cancelWorkspace({ ownerId, workspaceId });
      return response({ ok: true, cancelled: true, workspaceId });
    }
    assertEditable(workspace);
    if (request.method === 'PUT' && action === 'files') {
      const revision = expectedRevision(request);
      const body = await readBody(
        request,
        ['path', 'text'],
        WORKSPACE_EDITOR_LIMITS.maxBytes + 4096
      );
      const path = filePath(body.path);
      const files = filesOf(workspace);
      const selected = files.find((file) => file.path === path);
      if (!selected || typeof body.text !== 'string')
        throw new StudioError(400, 'فایل یا متن درخواست معتبر نیست.');
      const policy = validateEditableFile({ path, text: body.text });
      if (!policy.editable)
        throw new StudioError(
          422,
          'متن فایل برای ویرایش مجاز نیست یا بیش از حد مجاز است.'
        );
      assertAggregate(
        files.map((file) =>
          file.path === path ? { ...file, draftText: policy.text } : file
        )
      );
      const updated = await workspaces.updateWorkspaceFileDraft({
        ownerId,
        workspaceId,
        path,
        text: policy.text,
        digest: await digestText(policy.text),
        expectedRevision: revision
      });
      return workspaceResponse(updated);
    }
    if (request.method === 'POST' && action === 'files') {
      const body = await readBody(request, ['refId']);
      const updated = await controllerOperation(() =>
        controller.addWorkspaceFileFromRef({
          ownerId,
          workspaceId,
          refId: handle(body.refId)
        })
      );
      return workspaceResponse(updated);
    }
    if (request.method === 'PUT' && action === 'message') {
      const body = await readBody(request, ['message']);
      if (typeof body.message !== 'string')
        throw new StudioError(400, 'پیام Commit معتبر نیست.');
      const message = await controllerOperation(() =>
        normalizeCommitMessage(body.message)
      );
      return workspaceResponse(
        await workspaces.setCommitMessage({
          ownerId,
          workspaceId,
          message,
          digest: await digestText(message)
        })
      );
    }
    if (request.method === 'POST' && action === 'approval') {
      const body = await readBody(request, ['review', 'message'], 12288);
      const review = validateReview(body.review);
      if (typeof body.message !== 'string')
        throw new StudioError(400, 'پیام Commit معتبر نیست.');
      const message = await controllerOperation(() =>
        normalizeCommitMessage(body.message)
      );
      const expectedReview = {
        ...review,
        commitMessageDigest: await digestText(message)
      };
      return await requestApproval({
        ownerId,
        workspaceId,
        review: expectedReview,
        controller,
        bot
      });
    }
    throw new StudioError(405, 'روش درخواست مجاز نیست.');
  } catch (error) {
    if (error instanceof StudioError)
      return response({ ok: false, error: error.message }, error.status);
    if (error?.code === 'WORKSPACE_NOT_EDITABLE')
      return response(
        { ok: false, error: 'این فضای کار اکنون قابل ویرایش نیست.' },
        409
      );
    if (error?.code === 'REVISION_CONFLICT' || error?.status === 409)
      return response(
        {
          ok: false,
          error: 'نسخه فایل تغییر کرده است. آخرین نسخه را باز کنید.'
        },
        409
      );
    if (error?.code === 'DIFF_COMPLEXITY_LIMIT')
      return response(
        {
          ok: false,
          error:
            'تغییرات برای محاسبه امن Diff پیچیده‌اند؛ تغییرها را کوچک‌تر کنید.'
        },
        422
      );
    if (error?.code === 'WORKSPACE_LIMIT_EXCEEDED')
      return response(
        {
          ok: false,
          error: 'حجم یا تعداد فایل‌های فضای کار بیش از حد مجاز است.'
        },
        422
      );
    return response(
      { ok: false, error: 'عملیات انجام نشد. دوباره تلاش کنید.' },
      502
    );
  }
}
