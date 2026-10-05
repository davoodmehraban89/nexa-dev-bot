import { createGitHubPlugin as createLegacyGitHubPlugin } from './plugin-legacy.js';
const FULL_SHA = /^[a-f0-9]{40}$/i;
const from36 = value => /^[0-9a-z]+$/i.test(String(value || '')) ? Number.parseInt(value, 36) : NaN;
const mergeRef = value => { const m = String(value || '').match(/^mergepr:([0-9a-z]+):([0-9a-z]+):([a-f0-9]{40})$/i); if (!m) return null; const repoId = from36(m[1]); const prNumber = from36(m[2]); return Number.isSafeInteger(repoId) && Number.isSafeInteger(prNumber) && prNumber > 0 ? { repoId, prNumber, headSha: m[3].toLowerCase() } : null; };
export function createGitHubPlugin(options = {}) {
  const { github } = options; const base = createLegacyGitHubPlugin(options);
  return { ...base, resolveCallback(data, context = {}) {
    const merge = mergeRef(data);
    if (merge) return { actionId: 'github.pull_request.merge', approval: { input: merge, label: `Merge PR #${merge.prNumber}`, cancelCallback: `prdetail:${merge.repoId}:${merge.prNumber}` }, execute: async () => {
      const current = await github.getPullRequest(merge.repoId, merge.prNumber);
      if (current.merged || current.state !== 'open' || current.draft) throw new Error('Pull request is not mergeable');
      if (!FULL_SHA.test(String(current.headSha || '')) || String(current.headSha).toLowerCase() !== merge.headSha) throw new Error('Pull request head changed; fresh approval is required');
      const result = await github.mergePullRequest(merge.repoId, merge.prNumber, { expectedHeadSha: merge.headSha, mergeMethod: 'squash' });
      if (!result?.merged) throw new Error(result?.message || 'GitHub did not merge the pull request');
      return { text: `✅ <b>PR #${merge.prNumber} با موفقیت Merge شد.</b>`, reply_markup: { inline_keyboard: [[{ text: '🔙 PRها', callback_data: `prs:${merge.repoId}` }]] } };
    } };
    const route = base.resolveCallback(data, context); const detail = String(data || '').match(/^prdetail:(\d+):(\d+)$/); if (!route || !detail || typeof route.execute !== 'function') return route;
    const repoId = Number(detail[1]); const prNumber = Number(detail[2]);
    return { ...route, execute: async () => { const view = await route.execute(); const pr = await github.getPullRequest(repoId, prNumber); if (pr?.state !== 'open' || pr?.merged || pr?.draft || !FULL_SHA.test(String(pr?.headSha || ''))) return view; const callback = `mergepr:${repoId.toString(36)}:${prNumber.toString(36)}:${String(pr.headSha).toLowerCase()}`; if (callback.length > 64) return view; const rows = [...(view?.reply_markup?.inline_keyboard || [])]; rows.splice(Math.max(0, rows.length - 1), 0, [{ text: '🔀 Merge امن (Squash)', callback_data: callback }]); return { ...view, reply_markup: { ...(view.reply_markup || {}), inline_keyboard: rows } }; } };
  } };
}
