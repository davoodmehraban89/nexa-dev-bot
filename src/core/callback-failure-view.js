const WORKSPACE_CALLBACK = /^(?:ws|wfile|wtext|wmsg|wdiff|wready|wcancel):([A-Za-z0-9_-]{10})$/;

function legacyFailureView(data, error) {
  const reason = String(error?.message || 'Provider read failed');
  const permissionDenied = /403|resource not accessible by personal access token/i.test(reason);
  const repoMatch = String(data || '').match(/^[^:]+:(\d+)/);
  const fallback = repoMatch ? `repo:${repoMatch[1]}` : 'menu:main';
  const isIssues = String(data || '').startsWith('issues:');
  const detail = permissionDenied
    ? isIssues
      ? 'GitHub درخواست Issues را با خطای 403 رد کرد. در Fine-grained token، مجوز Repository permissions → Issues را روی Read قرار دهید.'
      : 'GitHub این درخواست خواندنی را با خطای 403 رد کرد. مجوز Read مربوط به این بخش در توکن فعلی کافی نیست.'
    : 'دریافت اطلاعات از سرویس با خطا مواجه شد. هیچ تغییری انجام نشد.';

  return {
    text:
`⚠️ <b>دریافت اطلاعات با خطا مواجه شد</b>
➖➖➖➖➖➖➖➖➖➖
${detail}

این خطا هیچ عملیات تغییردهنده‌ای اجرا نکرد.`,
    reply_markup: { inline_keyboard: [[{ text: repoMatch ? '↩️ بازگشت به پروژه' : '↩️ منوی اصلی', callback_data: fallback }]] },
    validationError: false
  };
}

export async function buildCallbackFailureView({ data, error, ownerId, workspaces } = {}) {
  const callback = String(data || '');
  const reason = String(error?.message || 'Provider read failed');
  const match = callback.match(WORKSPACE_CALLBACK);
  if (!match) return legacyFailureView(callback, error);

  const workspaceId = match[1];
  let workspace = null;
  if (ownerId !== undefined && ownerId !== null && typeof workspaces?.getWorkspace === 'function') {
    try {
      workspace = await workspaces.getWorkspace({ ownerId: String(ownerId), workspaceId });
    } catch {
      // Recovery must remain usable even if durable context lookup itself fails.
    }
  }

  const repoId = Number(workspace?.repoId);
  const hasRepo = Number.isSafeInteger(repoId);
  const missingCommitMessage = /^Commit message is required$/i.test(reason);
  const longCommitMessage = /^Commit message must be 120 characters or fewer$/i.test(reason);
  const noDraftChange = /^No draft change to commit$/i.test(reason);
  const validationError = missingCommitMessage || longCommitMessage || noDraftChange;

  let title = '⚠️ <b>عملیات Workspace متوقف شد</b>';
  let detail = 'Workspace و Draft شما حذف نشده‌اند. می‌توانید دوباره تلاش کنید یا به Draft برگردید.';
  if (missingCommitMessage) {
    title = '✍️ <b>پیام Commit لازم است</b>';
    detail = 'قبل از «آماده Commit»، یک پیام Commit ثبت کنید. Draft فعلی محفوظ است و هیچ تغییری در GitHub انجام نشده است.';
  } else if (longCommitMessage) {
    title = '✍️ <b>پیام Commit بیش از حد طولانی است</b>';
    detail = 'پیام Commit باید حداکثر 120 کاراکتر باشد. Draft فعلی محفوظ است و هیچ تغییری در GitHub انجام نشده است.';
  } else if (noDraftChange) {
    title = '📝 <b>تغییری برای Commit وجود ندارد</b>';
    detail = 'محتوای Draft با نسخهٔ اصلی یکسان است. ابتدا Draft را تغییر دهید؛ هیچ تغییری در GitHub انجام نشده است.';
  }

  const rows = [];
  if (missingCommitMessage || longCommitMessage) {
    rows.push([{ text: '✍️ ثبت پیام Commit', callback_data: `wmsg:${workspaceId}` }]);
  }
  rows.push([{ text: '🔄 تلاش مجدد', callback_data: callback }]);
  rows.push([{ text: '📝 ادامه Draft', callback_data: `ws:${workspaceId}` }]);
  if (hasRepo) rows.push([{ text: '📦 بازگشت به پروژه', callback_data: `repo:${repoId}` }]);
  rows.push([{ text: '🏠 منوی اصلی', callback_data: 'menu:main' }]);

  return {
    text: `${title}\n➖➖➖➖➖➖➖➖➖➖\n${detail}`,
    reply_markup: { inline_keyboard: rows },
    validationError
  };
}
