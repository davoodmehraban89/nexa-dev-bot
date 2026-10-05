import { createGitHubPlugin as createLegacyGitHubPlugin } from './plugin-legacy.js';

const FULL_SHA = /^[a-f0-9]{40}$/i;
const from36 = value => /^[0-9a-z]+$/i.test(String(value || '')) ? Number.parseInt(value, 36) : NaN;
const mergeRef = value => {
  const m = String(value || '').match(/^mergepr:([0-9a-z]+):([0-9a-z]+):([a-f0-9]{40})$/i);
  if (!m) return null;
  const repoId = from36(m[1]);
  const prNumber = from36(m[2]);
  return Number.isSafeInteger(repoId) && Number.isSafeInteger(prNumber) && prNumber > 0
    ? { repoId, prNumber, headSha: m[3].toLowerCase() }
    : null;
};

const cp3Pair = (value, prefix) => {
  const m = String(value || '').match(new RegExp('^' + prefix + ':(\\d+):(\\d+)$'));
  return m ? { repoId: Number(m[1]), runId: Number(m[2]) } : null;
};

const appendBeforeBack = (view, row) => {
  const rows = [...(view?.reply_markup?.inline_keyboard || [])];
  rows.splice(Math.max(0, rows.length - 1), 0, row);
  return { ...view, reply_markup: { ...(view.reply_markup || {}), inline_keyboard: rows } };
};

export function createGitHubPlugin(options = {}) {
  const { github } = options;
  const base = createLegacyGitHubPlugin(options);

  return {
    ...base,
    resolveCallback(data, context = {}) {
      const dispatch = cp3Pair(data, 'dispatchwf');
      if (dispatch) {
        return {
          actionId: 'github.workflow.dispatch',
          approval: {
            input: { repoId: dispatch.repoId, runId: dispatch.runId },
            label: 'اجرای Workflow',
            cancelCallback: `run:${dispatch.repoId}:${dispatch.runId}`
          },
          execute: async () => {
            const run = await github.getWorkflowRun(dispatch.repoId, dispatch.runId);
            if (!Number.isSafeInteger(Number(run.workflowId)) || !run.branch) {
              throw new Error('Workflow dispatch target is unavailable');
            }
            await github.dispatchWorkflow(dispatch.repoId, run.workflowId, { ref: run.branch, inputs: {} });
            return {
              text: '✅ درخواست اجرای Workflow برای GitHub ارسال شد.',
              reply_markup: {
                inline_keyboard: [[{ text: '🧪 مشاهده Run', callback_data: `run:${dispatch.repoId}:${dispatch.runId}` }]]
              }
            };
          }
        };
      }

      const rerunJob = cp3Pair(data, 'rerunjob');
      if (rerunJob) {
        return {
          actionId: 'github.workflow.job.rerun',
          approval: {
            input: { repoId: rerunJob.repoId, runId: rerunJob.runId, jobId: rerunJob.runId },
            label: 'اجرای مجدد Job',
            cancelCallback: `job:${rerunJob.repoId}:${rerunJob.runId}`
          },
          execute: async () => {
            const job = await github.getWorkflowJob(rerunJob.repoId, rerunJob.runId);
            if (!['failure', 'cancelled'].includes(String(job.conclusion || ''))) {
              throw new Error('Workflow job is not eligible for rerun');
            }
            await github.rerunJob(rerunJob.repoId, rerunJob.runId);
            return {
              text: '✅ درخواست اجرای مجدد Job برای GitHub ارسال شد.',
              reply_markup: {
                inline_keyboard: [[{ text: '👷 مشاهده Job', callback_data: `job:${rerunJob.repoId}:${rerunJob.runId}` }]]
              }
            };
          }
        };
      }

      const merge = mergeRef(data);
      if (merge) {
        return {
          actionId: 'github.pull_request.merge',
          approval: {
            input: merge,
            label: `Merge PR #${merge.prNumber}`,
            cancelCallback: `prdetail:${merge.repoId}:${merge.prNumber}`
          },
          execute: async () => {
            const current = await github.getPullRequest(merge.repoId, merge.prNumber);
            if (current.merged || current.state !== 'open' || current.draft) throw new Error('Pull request is not mergeable');
            if (!FULL_SHA.test(String(current.headSha || '')) || String(current.headSha).toLowerCase() !== merge.headSha) {
              throw new Error('Pull request head changed; fresh approval is required');
            }
            const result = await github.mergePullRequest(merge.repoId, merge.prNumber, {
              expectedHeadSha: merge.headSha,
              mergeMethod: 'squash'
            });
            if (!result?.merged) throw new Error(result?.message || 'GitHub did not merge the pull request');
            return {
              text: `✅ <b>PR #${merge.prNumber} با موفقیت Merge شد.</b>`,
              reply_markup: { inline_keyboard: [[{ text: '🔙 PRها', callback_data: `prs:${merge.repoId}` }]] }
            };
          }
        };
      }

      const route = base.resolveCallback(data, context);
      if (!route || typeof route.execute !== 'function') return route;

      const detail = String(data || '').match(/^prdetail:(\d+):(\d+)$/);
      const runDetail = String(data || '').match(/^run:(\d+):(\d+)$/);
      const jobDetail = String(data || '').match(/^job:(\d+):(\d+)$/);

      if (detail) {
        const repoId = Number(detail[1]);
        const prNumber = Number(detail[2]);
        return {
          ...route,
          execute: async () => {
            const view = await route.execute();
            const pr = await github.getPullRequest(repoId, prNumber);
            if (pr?.state !== 'open' || pr?.merged || pr?.draft || !FULL_SHA.test(String(pr?.headSha || ''))) return view;
            const callback = `mergepr:${repoId.toString(36)}:${prNumber.toString(36)}:${String(pr.headSha).toLowerCase()}`;
            if (callback.length > 64) return view;
            return appendBeforeBack(view, [{ text: '🔀 Merge امن (Squash)', callback_data: callback }]);
          }
        };
      }

      if (runDetail) {
        const repoId = Number(runDetail[1]);
        const runId = Number(runDetail[2]);
        return {
          ...route,
          execute: async () => {
            const view = await route.execute();
            const run = await github.getWorkflowRun(repoId, runId);
            const callback = `dispatchwf:${repoId}:${runId}`;
            if (!Number.isSafeInteger(Number(run.workflowId)) || !run.branch || callback.length > 64) return view;
            return appendBeforeBack(view, [{ text: '▶️ اجرای دوباره Workflow', callback_data: callback }]);
          }
        };
      }

      if (jobDetail) {
        const repoId = Number(jobDetail[1]);
        const jobId = Number(jobDetail[2]);
        return {
          ...route,
          execute: async () => {
            const view = await route.execute();
            const job = await github.getWorkflowJob(repoId, jobId);
            const callback = `rerunjob:${repoId}:${jobId}`;
            if (!['failure', 'cancelled'].includes(String(job.conclusion || '')) || callback.length > 64) return view;
            return appendBeforeBack(view, [{ text: '🔁 اجرای مجدد Job', callback_data: callback }]);
          }
        };
      }

      return route;
    }
  };
}
