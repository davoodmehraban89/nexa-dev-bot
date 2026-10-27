import { useEffect, useMemo, useState } from 'react';
import { ApiError, createApi } from './api.js';
import { CodeEditor, searchEditor } from './CodeEditor.js';
import type {
  Approval,
  Diff,
  Limits,
  Repository,
  ReviewSnapshot,
  TreeItem,
  Workspace,
  WorkspaceResponse
} from './types.js';

type Page = 'home' | 'tree' | 'editor' | 'review' | 'approval';
type Failure = { message: string; retry?: () => void };
const encoder = new TextEncoder();
const number = (value: number) => value.toLocaleString('fa-IR');
const bytes = (value: string) => encoder.encode(value).length;
const chars = (value: string) => Array.from(value).length;
const fileName = (path: string) => path.split('/').pop() || path;
const workspaceStorageKey = 'nexa.studio.workspace';
const workspaceIdPattern = /^[A-Za-z0-9]{10}$/;
function rememberWorkspace(id: string | null) {
  try {
    if (id && workspaceIdPattern.test(id))
      window.localStorage.setItem(workspaceStorageKey, id);
    else window.localStorage.removeItem(workspaceStorageKey);
  } catch {
    // Storage is optional; signed launch data and draft contents stay in memory.
  }
}
function rememberedWorkspace() {
  try {
    const id = window.localStorage.getItem(workspaceStorageKey);
    if (!id || workspaceIdPattern.test(id)) return id;
    rememberWorkspace(null);
  } catch {
    // Telegram browsers may disable local storage.
  }
  return null;
}
const unavailableWorkspace = (error: unknown) =>
  error instanceof ApiError && [400, 401, 403, 404, 410].includes(error.status);

function Icon({
  name,
  className = ''
}: {
  name:
    | 'code'
    | 'repo'
    | 'folder'
    | 'file'
    | 'arrow'
    | 'check'
    | 'lock'
    | 'search'
    | 'plus';
  className?: string;
}) {
  const paths = {
    code: (
      <>
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
      </>
    ),
    repo: (
      <>
        <path d="M4 4a2 2 0 0 1 2-2h14v20H6a2 2 0 0 1-2-2Zm0 13h16M8 6h7" />
      </>
    ),
    folder: <path d="M3 7V4h7l2 3h9v13H3Z" />,
    file: (
      <>
        <path d="M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h6" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7M16 12H3" />,
    check: <path d="m5 12 4 4L19 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />
  };
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function App({ fetcher = fetch }: { fetcher?: typeof fetch }) {
  const [telegram] = useState(() => window.Telegram?.WebApp);
  const [initData] = useState(() => telegram?.initData || '');
  const api = useMemo(() => createApi(initData, fetcher), [initData, fetcher]);
  const [page, setPage] = useState<Page>('home');
  const [userName, setUserName] = useState('');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [treePath, setTreePath] = useState('');
  const [items, setItems] = useState<TreeItem[]>([]);
  const [addingFile, setAddingFile] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [resumableWorkspace, setResumableWorkspace] =
    useState<Workspace | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activePath, setActivePath] = useState('');
  const [message, setMessage] = useState('');
  const [diff, setDiff] = useState<Diff | null>(null);
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(
    null
  );
  const [approval, setApproval] = useState<Approval | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [status, setStatus] = useState('');
  const [conflict, setConflict] = useState<{
    latest: WorkspaceResponse;
    path: string;
  } | null>(null);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const activeFile = workspace?.files.find((file) => file.path === activePath);
  const text = drafts[activePath] ?? '';
  const dirtyPaths =
    workspace?.files
      .filter(
        (file) => (drafts[file.path] ?? file.draftText) !== file.draftText
      )
      .map((file) => file.path) || [];
  const hasUnsaved = dirtyPaths.length > 0;
  const aggregateBytes =
    workspace?.files.reduce(
      (total, file) => total + bytes(drafts[file.path] ?? file.draftText),
      0
    ) || 0;
  const overLimit =
    !!limits &&
    (bytes(text) > limits.maxBytes ||
      chars(text) > limits.maxChars ||
      aggregateBytes > limits.maxAggregateBytes);
  const editable = workspace?.state === 'DRAFT' && !busy && !conflict;

  function showError(error: unknown, retry?: () => void) {
    setFailure({
      message:
        error instanceof ApiError
          ? error.message
          : 'ارتباط با سرویس برقرار نشد. اتصال را بررسی و دوباره تلاش کن.',
      retry
    });
  }
  async function perform(
    label: string,
    action: () => Promise<void>,
    retry?: () => void
  ) {
    setBusy(label);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      showError(error, retry);
    } finally {
      setBusy('');
    }
  }
  function acceptWorkspace(
    response: WorkspaceResponse,
    preserve = false,
    acceptedPath?: string
  ) {
    setReviewSnapshot(null);
    rememberWorkspace(response.workspace.id);
    setResumableWorkspace(response.workspace);
    setWorkspace((current) => ({
      ...response.workspace,
      files: response.workspace.files.map((file) => {
        const previous = current?.files.find(
          (entry) => entry.path === file.path
        );
        // An unrelated response must never authorize overwriting an unseen edit.
        return preserve && previous && file.path !== acceptedPath
          ? previous
          : file;
      })
    }));
    if (response.limits) setLimits(response.limits);
    setDrafts((current) =>
      Object.fromEntries(
        response.workspace.files.map((file) => [
          file.path,
          preserve && current[file.path] !== undefined
            ? current[file.path]
            : file.draftText
        ])
      )
    );
  }
  async function getRememberedWorkspace(id: string) {
    try {
      const result = await api<WorkspaceResponse>(`/workspaces/${id}`);
      if (
        result.workspace.id !== id ||
        !['DRAFT', 'READY', 'COMMITTED', 'COMMITTING'].includes(
          result.workspace.state
        )
      ) {
        rememberWorkspace(null);
        setResumableWorkspace(null);
        return null;
      }
      setResumableWorkspace(result.workspace);
      return result;
    } catch (error) {
      if (!unavailableWorkspace(error)) throw error;
      rememberWorkspace(null);
      setResumableWorkspace(null);
      return null;
    }
  }
  async function loadHome() {
    await perform(
      'در حال دریافت مخازن…',
      async () => {
        let session;
        try {
          session = await api<{ user: { name: string }; limits: Limits }>('');
        } catch (error) {
          if (unavailableWorkspace(error)) {
            rememberWorkspace(null);
            setResumableWorkspace(null);
          }
          throw error;
        }
        setUserName(session.user.name);
        setLimits(session.limits);
        const savedId = rememberedWorkspace();
        const [repos] = await Promise.all([
          api<{ repositories: Repository[] }>('/repos'),
          savedId ? getRememberedWorkspace(savedId) : Promise.resolve(null)
        ]);
        setRepositories(repos.repositories);
        setPage('home');
      },
      () => void loadHome()
    );
  }
  async function continueWorkspace() {
    if (!resumableWorkspace) return;
    await perform(
      'در حال دریافت فضای کاری…',
      async () => {
        const result = await getRememberedWorkspace(resumableWorkspace.id);
        if (!result) return;
        const restored = result.workspace;
        acceptWorkspace(result);
        setRepository(
          repositories.find(
            (repo) => String(repo.id) === String(restored.repoId)
          ) || null
        );
        setActivePath(restored.path || restored.files[0]?.path || '');
        setMessage(restored.commitMessage || '');
        setApproval(null);
        setDiff(null);
        setConflict(null);
        setStatus('');
        if (restored.state === 'READY') {
          const reviewed = await api<{ diff: Diff; review: ReviewSnapshot }>(
            `/workspaces/${restored.id}/diff`
          );
          if (!reviewed.review) throw new Error('Review snapshot unavailable');
          setDiff(reviewed.diff);
          setReviewSnapshot(reviewed.review);
          setPage('review');
        } else if (
          restored.state === 'COMMITTED' ||
          restored.state === 'COMMITTING'
        ) {
          setPage('approval');
        } else setPage('editor');
      },
      () => void continueWorkspace()
    );
  }
  useEffect(() => {
    if (!initData) return;
    telegram?.ready?.();
    telegram?.expand?.();
    void loadHome();
    // The signed Telegram launch data stays in memory for this mount only.
  }, [api]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    if (hasUnsaved) telegram?.enableClosingConfirmation?.();
    else telegram?.disableClosingConfirmation?.();
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasUnsaved, telegram]);
  function guard(action: () => void) {
    if (hasUnsaved) setDiscardAction(() => action);
    else action();
  }
  function backToFiles() {
    guard(() => {
      if (!repository) {
        setPage('home');
        return;
      }
      setDrafts(
        Object.fromEntries(
          workspace?.files.map((file) => [file.path, file.draftText]) || []
        )
      );
      setAddingFile(false);
      setConflict(null);
      setStatus('');
      void loadTree(repository, '');
    });
  }
  useEffect(() => {
    const button = telegram?.BackButton;
    if (!button) return;
    const back = () => {
      if (busy) return;
      if (page === 'review' || (page === 'tree' && addingFile))
        setPage('editor');
      else if (page === 'editor') backToFiles();
      else if (page === 'tree') setPage('home');
      else if (page === 'approval') guard(() => telegram?.close?.());
    };
    if (page === 'home') button.hide();
    else button.show();
    button.onClick(back);
    return () => button.offClick(back);
  }, [page, busy, hasUnsaved, addingFile, repository]);

  async function loadTree(repo: Repository, path: string, adding = false) {
    await perform(
      'در حال دریافت فایل‌ها…',
      async () => {
        const query = new URLSearchParams({ repoId: String(repo.id), path });
        if (adding && workspace) query.set('workspaceId', workspace.id);
        const result = await api<{ items: TreeItem[]; path: string }>(
          `/tree?${query}`
        );
        setRepository(repo);
        setTreePath(result.path);
        setItems(result.items);
        setAddingFile(adding);
        setPage('tree');
      },
      () => void loadTree(repo, path, adding)
    );
  }
  async function openFile(item: TreeItem) {
    if (item.type === 'dir' || item.type === 'directory') {
      if (repository) await loadTree(repository, item.path, addingFile);
      return;
    }
    await perform(
      'در حال باز کردن فایل…',
      async () => {
        if (addingFile && workspace) {
          const result = await api<WorkspaceResponse>(
            `/workspaces/${workspace.id}/files`,
            { method: 'POST', body: JSON.stringify({ refId: item.refId }) }
          );
          acceptWorkspace(result, true);
          setActivePath(item.path);
        } else {
          const result = await api<WorkspaceResponse>('/workspaces', {
            method: 'POST',
            body: JSON.stringify({ refId: item.refId })
          });
          acceptWorkspace(result);
          setActivePath(
            result.workspace.path || result.workspace.files[0].path
          );
          setMessage(result.workspace.commitMessage || '');
          setApproval(null);
          setDiff(null);
        }
        setAddingFile(false);
        setStatus('');
        setPage('editor');
      },
      () => void openFile(item)
    );
  }
  async function saveFile() {
    if (
      !workspace ||
      !activeFile ||
      overLimit ||
      !editable ||
      !dirtyPaths.includes(activePath)
    )
      return;
    const selectedPath = activePath;
    const savedText = text;
    await perform(
      'در حال ذخیره…',
      async () => {
        try {
          const result = await api<WorkspaceResponse>(
            `/workspaces/${workspace.id}/files`,
            {
              method: 'PUT',
              headers: { 'if-match': String(activeFile.revision) },
              body: JSON.stringify({ path: selectedPath, text: savedText })
            }
          );
          acceptWorkspace(result, true, selectedPath);
          setDrafts((current) => ({
            ...current,
            [selectedPath]:
              result.workspace.files.find((file) => file.path === selectedPath)
                ?.draftText ?? savedText
          }));
          setStatus(
            'تغییرات در فضای کاری ذخیره شد. هنوز چیزی در GitHub ثبت نشده است.'
          );
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          const latest = await api<WorkspaceResponse>(
            `/workspaces/${workspace.id}`
          );
          setConflict({ latest, path: selectedPath });
          setStatus('');
        }
      },
      () => void saveFile()
    );
  }
  function resolveConflict(keepMine: boolean) {
    if (!conflict) return;
    acceptWorkspace(conflict.latest, true, conflict.path);
    if (!keepMine) {
      const latest = conflict.latest.workspace.files.find(
        (file) => file.path === conflict.path
      );
      if (latest)
        setDrafts((current) => ({
          ...current,
          [conflict.path]: latest.draftText
        }));
    }
    setConflict(null);
    setStatus(
      keepMine
        ? 'نسخه تو نگه داشته شد. برای جایگزینی نسخه سرور، دوباره «ذخیره تغییرات» را بزن.'
        : 'نسخه جدید بارگیری شد. می‌توانی ویرایش را ادامه بدهی.'
    );
  }
  async function review(refresh = false) {
    if (!workspace || hasUnsaved || conflict) return;
    setReviewSnapshot(null);
    await perform(
      'در حال آماده‌سازی Diff…',
      async () => {
        if (refresh) {
          const latest = await api<WorkspaceResponse>(
            `/workspaces/${workspace.id}`
          );
          acceptWorkspace(latest);
        }
        const result = await api<{ diff: Diff; review: ReviewSnapshot }>(
          `/workspaces/${workspace.id}/diff`
        );
        if (!result.review) throw new Error('Review snapshot unavailable');
        setDiff(result.diff);
        setReviewSnapshot(result.review);
        setPage('review');
        setStatus('');
      },
      () => void review(refresh)
    );
  }
  async function requestApproval() {
    if (
      !workspace ||
      !reviewSnapshot ||
      !message.trim() ||
      chars(message.trim()) > 120 ||
      hasUnsaved ||
      diff?.truncated
    )
      return;
    const reviewed = reviewSnapshot;
    const expectedMessage = message.trim();
    await perform(
      'در حال ارسال درخواست تأیید…',
      async () => {
        try {
          await api<WorkspaceResponse>(`/workspaces/${workspace.id}/message`, {
            method: 'PUT',
            body: JSON.stringify({ message: expectedMessage })
          });
          // A message response may contain a concurrent edit. Keep the displayed review fixed.
          setWorkspace((current) =>
            current ? { ...current, commitMessage: expectedMessage } : current
          );
          const requested = await api<Approval>(
            `/workspaces/${workspace.id}/approval`,
            {
              method: 'POST',
              body: JSON.stringify({
                review: reviewed,
                message: expectedMessage
              })
            }
          );
          if (!requested.approvalRequested)
            throw new Error('Approval was not requested');
          setApproval(requested);
          setPage('approval');
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          setReviewSnapshot(null);
          showError(error);
        }
      },
      () => void requestApproval()
    );
  }
  async function refreshWorkspace() {
    if (!workspace) return;
    await perform(
      'در حال بررسی نتیجه…',
      async () => {
        const result = await api<WorkspaceResponse>(
          `/workspaces/${workspace.id}`
        );
        acceptWorkspace(result);
        setStatus(
          result.workspace.state === 'COMMITTED'
            ? ''
            : 'هنوز نتیجه ثبت Commit دریافت نشده است. وضعیت تأیید را در تلگرام بررسی کن.'
        );
      },
      () => void refreshWorkspace()
    );
  }
  async function cancelWorkspace() {
    if (!workspace) return;
    await perform(
      'در حال لغو فضای کاری…',
      async () => {
        await api(`/workspaces/${workspace.id}`, { method: 'DELETE' });
        rememberWorkspace(null);
        setResumableWorkspace(null);
        setWorkspace(null);
        setDrafts({});
        setApproval(null);
        setStatus('فضای کاری لغو شد.');
        setPage('home');
      },
      () => void cancelWorkspace()
    );
  }

  useEffect(() => {
    if (!discardAction) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]'
        ) || []
      );
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDiscardAction(null);
      }
      if (event.key === 'Tab') {
        const controls = focusable();
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [discardAction]);

  const repoLabel = (
    <span dir="ltr">{repository?.fullName || workspace?.repoFullName}</span>
  );
  const workspaceHeader = workspace && (
    <div className="workspace-header">
      <div>
        <p className="eyebrow">فضای کاری</p>
        <h1 className="workspace-title" dir="ltr">
          {workspace.repoFullName}
        </h1>
        <div className="workspace-meta">
          <span>
            مبنای تغییر <bdi>{workspace.baseBranch}</bdi>
          </span>
          <span className="inline-code" dir="ltr">
            {workspace.baseHeadSha.slice(0, 10)}
          </span>
          <span>{number(workspace.files.length)} فایل</span>
        </div>
      </div>
      <span className="badge">
        {workspace.state === 'COMMITTED' ? 'ثبت‌شده' : 'پیش‌نویس امن'}
      </span>
    </div>
  );

  return (
    <div className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="code" />
          </span>
          <span>
            <span className="brand-name">
              Nexa <strong>Studio</strong>
            </span>
            <span className="brand-subtitle">
              از ایده تا تغییر، داخل تلگرام
            </span>
          </span>
        </div>
        {userName && <span className="user-pill">{userName}</span>}
      </header>
      <main className="app-main" aria-busy={!!busy}>
        {!initData ? (
          <section className="empty-state">
            <span className="brand-mark">
              <Icon name="lock" />
            </span>
            <h1>استودیوی تو، داخل تلگرام</h1>
            <p>
              برای دسترسی امن به مخازن، Nexa Studio را از دکمه داخل ربات تلگرام
              باز کن.
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              بررسی دوباره
            </button>
          </section>
        ) : (
          <>
            {failure && (
              <div className="notice error" role="alert">
                <div>
                  <strong className="notice-title">درخواست انجام نشد</strong>
                  <p>{failure.message}</p>
                </div>
                {failure.retry && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!!busy}
                    onClick={failure.retry}
                  >
                    تلاش دوباره
                  </button>
                )}
              </div>
            )}
            {status && (
              <div className="notice info" role="status">
                <Icon name="check" />
                <p>{status}</p>
              </div>
            )}
            {busy && (
              <div className="loading-state" role="status">
                <span className="spinner" />
                {busy}
              </div>
            )}
            {page === 'home' && (
              <section>
                <div className="screen-heading">
                  <p className="eyebrow">میز کار تو</p>
                  <h1 className="screen-title">
                    {userName
                      ? `${userName}، از کجا شروع کنیم؟`
                      : 'یک تغییر کوچک، یک قدم جلوتر.'}
                  </h1>
                  <p className="screen-description">
                    مخزنت را باز کن، فایل‌ها را ویرایش کن و تغییرات را پیش از
                    تأیید ببین.
                  </p>
                </div>
                {resumableWorkspace && (
                  <div className="notice info">
                    <div>
                      <strong>فضای کاری قبلی</strong>
                      <p dir="ltr">{resumableWorkspace.repoFullName}</p>
                    </div>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!!busy}
                      onClick={() => guard(() => void continueWorkspace())}
                    >
                      ادامه فضای کاری
                    </button>
                  </div>
                )}
                <div className="panel-heading">
                  <h2>مخازن GitHub</h2>
                  <button
                    className="button quiet small"
                    type="button"
                    disabled={!!busy}
                    onClick={() => void loadHome()}
                  >
                    تازه‌سازی
                  </button>
                </div>
                {!busy && !failure && repositories.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="repo" />
                    <h2>مخزنی برای نمایش نیست</h2>
                    <p>
                      دسترسی حساب متصل به مخازن را در GitHub بررسی کن، سپس
                      دوباره دریافت کن.
                    </p>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => void loadHome()}
                    >
                      دریافت دوباره مخازن
                    </button>
                  </div>
                ) : (
                  <div className="repo-list">
                    {repositories.map((repo) => (
                      <button
                        key={repo.id}
                        className="repo-card"
                        type="button"
                        disabled={!!busy}
                        onClick={() => void loadTree(repo, '')}
                      >
                        <span className="repo-icon">
                          <Icon name="repo" />
                        </span>
                        <span className="repo-copy">
                          <span className="repo-name" dir="ltr">
                            {repo.name}
                          </span>
                          <span className="repo-description">
                            {repo.description || repo.fullName}
                          </span>
                          <span className="repo-meta">
                            <span>{repo.private ? 'خصوصی' : 'عمومی'}</span>
                            <bdi>{repo.defaultBranch}</bdi>
                          </span>
                        </span>
                        <Icon name="arrow" />
                      </button>
                    ))}
                  </div>
                )}
                <p className="screen-footer">
                  <Icon name="lock" />
                  هیچ تغییری بدون تأیید امن تو در تلگرام ثبت نمی‌شود.
                </p>
              </section>
            )}
            {page === 'tree' && repository && (
              <section>
                <button
                  className="button quiet back-button"
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    if (addingFile) setPage('editor');
                    else setPage('home');
                  }}
                >
                  <Icon name="arrow" />
                  {addingFile ? 'بازگشت به ویرایشگر' : 'همه مخازن'}
                </button>
                <div className="screen-heading">
                  <p className="eyebrow">
                    {addingFile ? 'افزودن به فضای کاری' : 'مرور مخزن'}
                  </p>
                  <h1 className="screen-title" dir="ltr">
                    {repository.name}
                  </h1>
                  <p className="screen-description">
                    {addingFile
                      ? 'فایل بعدی را برای ویرایش کنار فایل‌های فعلی انتخاب کن.'
                      : 'یک فایل متنی را انتخاب کن تا فضای کاری‌ات باز شود.'}
                  </p>
                </div>
                <div className="browser-panel">
                  <nav className="breadcrumb" aria-label="مسیر مخزن">
                    <button
                      className="button quiet small"
                      type="button"
                      disabled={!!busy}
                      onClick={() => void loadTree(repository, '', addingFile)}
                    >
                      {repoLabel}
                    </button>
                    {treePath
                      .split('/')
                      .filter(Boolean)
                      .map((part, index, parts) => (
                        <button
                          key={index}
                          className="button quiet small"
                          type="button"
                          disabled={!!busy}
                          onClick={() =>
                            void loadTree(
                              repository,
                              parts.slice(0, index + 1).join('/'),
                              addingFile
                            )
                          }
                        >
                          <bdi>{part}</bdi>
                        </button>
                      ))}
                  </nav>
                  {items.length ? (
                    <div className="tree-list">
                      {items.map((item) => {
                        const directory =
                          item.type === 'dir' || item.type === 'directory';
                        const exists =
                          addingFile &&
                          workspace?.files.some(
                            (file) => file.path === item.path
                          );
                        return (
                          <button
                            key={item.refId}
                            className="tree-row"
                            type="button"
                            disabled={!!busy || !!exists}
                            onClick={() => void openFile(item)}
                          >
                            <span className="tree-icon">
                              <Icon name={directory ? 'folder' : 'file'} />
                            </span>
                            <span className="tree-name" dir="ltr">
                              {item.name}
                            </span>
                            <span className="tree-detail">
                              {exists
                                ? 'در فضای کاری'
                                : directory
                                  ? 'پوشه'
                                  : `${number(item.size || 0)} بایت`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Icon name="folder" />
                      <h2>این پوشه خالی است</h2>
                      <p>به ریشه مخزن برگرد و پوشه دیگری را باز کن.</p>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          void loadTree(repository, '', addingFile)
                        }
                      >
                        ریشه مخزن
                      </button>
                    </div>
                  )}
                </div>
                {addingFile && limits && (
                  <p className="field-help">
                    تا {number(limits.maxFiles)} فایل و مجموع{' '}
                    {number(limits.maxAggregateBytes)} بایت در هر فضای کاری.
                  </p>
                )}
              </section>
            )}
            {page === 'editor' && workspace && activeFile && limits && (
              <section>
                <button
                  className="button quiet back-button"
                  type="button"
                  disabled={!!busy}
                  onClick={backToFiles}
                >
                  <Icon name="arrow" />
                  بازگشت به فایل‌ها
                </button>
                {workspaceHeader}
                {conflict && (
                  <div className="conflict-panel" role="alert">
                    <strong>نسخه این فایل تغییر کرده است</strong>
                    <p>
                      یک نسخه تازه روی سرور وجود دارد. نسخه تو هنوز اینجاست؛
                      خودت انتخاب کن کدام را ادامه بدهی.
                    </p>
                    <div className="action-row">
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => resolveConflict(true)}
                      >
                        نگه‌داشتن نسخه من
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => resolveConflict(false)}
                      >
                        بارگیری نسخه جدید
                      </button>
                    </div>
                  </div>
                )}
                <div className="workspace-layout">
                  <div className="editor-panel">
                    <div className="editor-toolbar">
                      <div
                        className="file-tabs"
                        role="tablist"
                        aria-label="فایل‌های فضای کاری"
                      >
                        {workspace.files.map((file) => (
                          <button
                            key={file.path}
                            type="button"
                            role="tab"
                            title={file.path}
                            aria-selected={file.path === activePath}
                            disabled={!!busy || !!conflict}
                            className={`file-tab${file.path === activePath ? ' active' : ''}${dirtyPaths.includes(file.path) ? ' dirty' : ''}`}
                            onClick={() => {
                              setActivePath(file.path);
                              setStatus('');
                            }}
                          >
                            <Icon name="file" />
                            <bdi>{fileName(file.path)}</bdi>
                            {dirtyPaths.includes(file.path) && (
                              <span aria-label="ذخیره نشده">●</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="editor-settings">
                        <button
                          className="icon-button"
                          type="button"
                          title="جست‌وجو در فایل"
                          aria-label="جست‌وجو در فایل"
                          onClick={searchEditor}
                        >
                          <Icon name="search" />
                        </button>
                        <label className="font-control">
                          اندازه کد
                          <select
                            className="select-control"
                            aria-label="اندازه قلم کد"
                            value={fontSize}
                            onChange={(event) =>
                              setFontSize(Number(event.target.value))
                            }
                          >
                            {[12, 14, 16, 18, 20].map((size) => (
                              <option key={size} value={size}>
                                {number(size)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                    <CodeEditor
                      value={text}
                      path={activePath}
                      readOnly={!editable}
                      fontSize={fontSize}
                      onChange={(value) => {
                        setReviewSnapshot(null);
                        setDrafts((current) => ({
                          ...current,
                          [activePath]: value
                        }));
                        setStatus('');
                      }}
                    />
                    <div className="editor-status">
                      <span>
                        <span
                          className={`status-dot ${dirtyPaths.includes(activePath) ? 'dirty' : 'saved'}`}
                        />
                        {dirtyPaths.includes(activePath)
                          ? 'تغییرات ذخیره نشده'
                          : 'ذخیره‌شده در فضای کاری'}
                      </span>
                      <span
                        className={`count-limit${overLimit ? ' over-limit' : ''}`}
                      >
                        {number(bytes(text))} / {number(limits.maxBytes)} بایت ·{' '}
                        {number(chars(text))} / {number(limits.maxChars)} نویسه
                      </span>
                    </div>
                  </div>
                </div>
                {overLimit && (
                  <div className="notice warning" role="alert">
                    سقف مجاز فایل یا مجموع فضای کاری رد شده است. پیش از ذخیره،
                    حجم متن را کم کن.
                  </div>
                )}
                <div className="editor-actions">
                  <button
                    className="button primary"
                    type="button"
                    disabled={
                      !editable || overLimit || !dirtyPaths.includes(activePath)
                    }
                    onClick={() => void saveFile()}
                  >
                    <Icon name="check" />
                    ذخیره تغییرات
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={
                      !!busy ||
                      !!conflict ||
                      hasUnsaved ||
                      !['DRAFT', 'READY'].includes(workspace.state)
                    }
                    onClick={() => void review()}
                  >
                    بازبینی تغییرات
                  </button>
                  <button
                    className="button quiet"
                    type="button"
                    disabled={
                      !!busy ||
                      !!conflict ||
                      !repository ||
                      workspace.files.length >= limits.maxFiles ||
                      workspace.state !== 'DRAFT'
                    }
                    onClick={() =>
                      repository && void loadTree(repository, '', true)
                    }
                  >
                    <Icon name="plus" />
                    افزودن فایل
                  </button>
                </div>
                <p className="field-help">
                  {hasUnsaved
                    ? 'هر فایل تغییرکرده را ذخیره کن تا Diff و درخواست تأیید در دسترس باشد.'
                    : 'ذخیره، فقط پیش‌نویس فضای کاری را به‌روز می‌کند. ثبت در GitHub به تأیید جداگانه نیاز دارد.'}
                </p>
                <div className="screen-footer">
                  <span>
                    مجموع فضای کاری: {number(aggregateBytes)} /{' '}
                    {number(limits.maxAggregateBytes)} بایت
                  </span>
                  <button
                    className="button quiet small danger"
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      setDiscardAction(() => () => void cancelWorkspace())
                    }
                  >
                    لغو فضای کاری
                  </button>
                </div>
              </section>
            )}
            {page === 'review' && workspace && diff && (
              <section>
                <button
                  className="button quiet back-button"
                  type="button"
                  disabled={!!busy}
                  onClick={() => setPage('editor')}
                >
                  <Icon name="arrow" />
                  بازگشت به ویرایشگر
                </button>
                {workspaceHeader}
                <div className="screen-heading">
                  <p className="eyebrow">قبل از ثبت</p>
                  <h2 className="screen-title">یک بار دیگر، با دقت.</h2>
                  <p className="screen-description">
                    فایل‌ها، تفاوت‌ها و پیام Commit را بررسی کن. تأیید نهایی در
                    تلگرام انجام می‌شود.
                  </p>
                </div>
                <div className="review-panel">
                  <div className="review-summary">
                    <div className="review-facts">
                      <div className="review-fact">
                        <span>مخزن</span>
                        <strong dir="ltr">{workspace.repoFullName}</strong>
                      </div>
                      <div className="review-fact">
                        <span>شاخه مبنا</span>
                        <strong dir="ltr">{workspace.baseBranch}</strong>
                      </div>
                      <div className="review-fact">
                        <span>شاخه جدید</span>
                        <strong dir="ltr">nexa/edit-{workspace.id}</strong>
                      </div>
                      <div className="review-fact">
                        <span>نسخه مبنا</span>
                        <strong dir="ltr">
                          {workspace.baseHeadSha.slice(0, 10)}
                        </strong>
                      </div>
                    </div>
                    <ul className="review-files">
                      {workspace.files.map((file) => (
                        <li key={file.path}>
                          <Icon name="file" />
                          <bdi>{file.path}</bdi>
                          <span className="badge">ویرایش</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="diff-toolbar">
                    <strong>تفاوت تغییرات · Diff</strong>
                    <span>
                      <bdi>+{number(diff.additions)}</bdi> /{' '}
                      <bdi>−{number(diff.deletions)}</bdi>
                    </span>
                  </div>
                  <pre
                    className="diff-view"
                    dir="ltr"
                    tabIndex={0}
                    aria-label="تفاوت تغییرات"
                  >
                    {diff.text
                      ? diff.text.split('\n').map((line, index) => (
                          <span
                            key={index}
                            className={`diff-line ${line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'addition' : line.startsWith('-') ? 'deletion' : 'context'}`}
                          >
                            {line}
                            {'\n'}
                          </span>
                        ))
                      : 'تغییری برای ثبت وجود ندارد.'}
                  </pre>
                </div>
                {!reviewSnapshot && (
                  <div className="notice warning" role="alert">
                    <p>
                      تغییرات از زمان بازبینی عوض شده‌اند. آخرین نسخه را دریافت
                      و Diff تازه را بررسی کن.
                    </p>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!!busy}
                      onClick={() => void review(true)}
                    >
                      بارگیری و بازبینی تازه
                    </button>
                  </div>
                )}
                {diff.truncated && (
                  <div className="notice warning" role="alert">
                    Diff کامل نیست. برای بازبینی امن، تغییرات را کوچک‌تر کن.
                  </div>
                )}
                <label className="field">
                  <span>پیام Commit</span>
                  <input
                    className="text-input"
                    dir="auto"
                    aria-label="پیام Commit"
                    value={message}
                    disabled={!!busy}
                    autoComplete="off"
                    placeholder="مثلاً: اصلاح عنوان صفحه اصلی"
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <span className="field-help">
                    در یک جمله توضیح بده چه چیزی تغییر کرده است. حداکثر ۱۲۰
                    نویسه.
                  </span>
                </label>
                {chars(message.trim()) > 120 && (
                  <p className="notice warning" role="alert">
                    پیام را به ۱۲۰ نویسه یا کمتر کوتاه کن.
                  </p>
                )}
                <div className="sticky-actions">
                  <button
                    className="button primary"
                    type="button"
                    disabled={
                      !!busy ||
                      !message.trim() ||
                      chars(message.trim()) > 120 ||
                      !reviewSnapshot ||
                      diff.truncated ||
                      diff.additions + diff.deletions === 0
                    }
                    onClick={() => void requestApproval()}
                  >
                    <Icon name="lock" />
                    درخواست تأیید امن
                  </button>
                  <span className="field-help">
                    این دکمه درخواست تأیید می‌فرستد؛ Commit پس از تأیید تو در
                    تلگرام ثبت می‌شود.
                  </span>
                </div>
              </section>
            )}
            {page === 'approval' &&
              workspace &&
              (approval ||
                ['COMMITTED', 'COMMITTING'].includes(workspace.state)) && (
                <section className="approval-panel">
                  <span className="brand-mark">
                    <Icon
                      name={workspace.state === 'COMMITTED' ? 'check' : 'lock'}
                    />
                  </span>
                  <p className="eyebrow">
                    {workspace.state === 'COMMITTED'
                      ? 'نتیجه دریافت‌شده از سرور'
                      : approval
                        ? 'یک گام تا ثبت تغییرات'
                        : 'وضعیت دریافت‌شده از سرور'}
                  </p>
                  <h1 className="screen-title">
                    {workspace.state === 'COMMITTED'
                      ? 'Commit ثبت شد'
                      : approval
                        ? 'درخواست تأیید به تلگرام فرستاده شد'
                        : 'ثبت تغییرات در حال بررسی است'}
                  </h1>
                  <p className="screen-description">
                    {workspace.state === 'COMMITTED'
                      ? 'نتیجه فضای کاری تأیید می‌کند که تغییرات روی شاخه جدید ثبت شده‌اند.'
                      : approval
                        ? 'به گفت‌وگو با ربات برگرد و درخواست امضاشده را بررسی و تأیید کن. تا آن زمان، تغییری در GitHub ثبت نمی‌شود.'
                        : 'نتیجه نهایی هنوز دریافت نشده است. وضعیت را دوباره از سرور بررسی کن.'}
                  </p>
                  <div className="approval-target">
                    <strong dir="ltr">{workspace.repoFullName}</strong>
                    <span dir="ltr">
                      {workspace.result?.branch ||
                        approval?.targetBranch ||
                        `nexa/edit-${workspace.id}`}
                    </span>
                    {workspace.result?.commitSha && (
                      <code>{workspace.result.commitSha.slice(0, 12)}</code>
                    )}
                  </div>
                  {workspace.state === 'COMMITTED' &&
                    workspace.result?.commitSha && (
                      <a
                        className="button primary result-link"
                        href={`https://github.com/${workspace.repoFullName.split('/').map(encodeURIComponent).join('/')}/commit/${encodeURIComponent(workspace.result.commitSha)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        مشاهده Commit در GitHub
                      </a>
                    )}
                  <div className="action-row">
                    <button
                      className="button primary close-action"
                      type="button"
                      disabled={!!busy}
                      onClick={() => telegram?.close?.()}
                    >
                      بستن و رفتن به تلگرام
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!!busy}
                      onClick={() => void refreshWorkspace()}
                    >
                      بررسی نتیجه
                    </button>
                  </div>
                  {workspace.state !== 'COMMITTED' && (
                    <button
                      className="button quiet small danger"
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        setDiscardAction(() => () => void cancelWorkspace())
                      }
                    >
                      لغو فضای کاری
                    </button>
                  )}
                </section>
              )}
          </>
        )}
      </main>
      <footer className="app-footer">
        <span>Nexa Studio</span>
        <span>تغییر با اختیار تو.</span>
      </footer>
      {discardAction && (
        <div className="modal-backdrop">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-description"
          >
            <h2 id="discard-title">ادامه می‌دهی؟</h2>
            <p id="discard-description">
              {hasUnsaved
                ? 'بخشی از تغییرات هنوز ذخیره نشده است. با ادامه، این تغییرات از ویرایشگر کنار گذاشته می‌شوند.'
                : 'با لغو فضای کاری، این پیش‌نویس دیگر قابل ادامه نیست.'}
            </p>
            <div className="dialog-actions">
              <button
                className="button secondary"
                type="button"
                autoFocus
                onClick={() => setDiscardAction(null)}
              >
                ادامه ویرایش
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => {
                  const action = discardAction;
                  setDiscardAction(null);
                  action();
                }}
              >
                کنار گذاشتن و ادامه
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
