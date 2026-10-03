import { githubPluginManifest } from './manifest.js';

const CALLBACK_ACTIONS = Object.freeze([
  ['files:', 'github.files.list'],
  ['tree:', 'github.tree.read'],
  ['blob:', 'github.blob.read'],
  ['pr:', 'github.pr.list'],
  ['commits:', 'github.commits.list'],
  ['status:', 'github.status.read']
]);

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const numericPair = (value, prefix) => {
  const match = String(value || '').match(new RegExp(`^${prefix}:(\\d+):(\\d+)$`));
  if (!match) return null;
  return { repoId: Number(match[1]), runId: Number(match[2]) };
};

const numericSingle = (value, prefix) => {
  const match = String(value || '').match(new RegExp(`^${prefix}:(\\d+)$`));
  return match ? Number(match[1]) : null;
};

const runIcon = run => {
  if (run.conclusion === 'success') return '✅';
  if (run.conclusion === 'failure') return '❌';
  if (run.conclusion === 'cancelled') return '⏹';
  return run.status === 'in_progress' ? '🟡' : '⏳';
};

const addCiButton = (view, repoId) => {
  const rows = [...(view?.reply_markup?.inline_keyboard || [])];
  const ciRow = [{ text: '🧪 CI / Actions', callback_data: `runs:${repoId}` }];
  const insertAt = Math.max(0, rows.length - 1);
  rows.splice(insertAt, 0, ciRow);
  return {
    ...view,
    reply_markup: {
      ...(view?.reply_markup || {}),
      inline_keyboard: rows
    }
  };
};

async function workflowRunsView(github, repoId) {
  const [repo, runs] = await Promise.all([
    github.getRepository(repoId),
    github.listWorkflowRuns(repoId)
  ]);
  const body = runs.length
    ? runs.slice(0, 10).map(run => `${runIcon(run)} <b>${escapeHtml(run.name)}</b> #${run.runNumber ?? '-'}\n  └ ${escapeHtml(run.branch || '-')} · <code>${escapeHtml(run.sha || '-')}</code> · ${escapeHtml(run.conclusion || run.status || 'unknown')}`).join('\n\n')
    : '<i>Workflow runی یافت نشد.</i>';

  return {
    text: `🧪 <b>CI / Actions — ${escapeHtml(repo.name)}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: {
      inline_keyboard: [
        ...runs.slice(0, 10).map(run => [{
          text: `${runIcon(run)} ${run.name} #${run.runNumber ?? run.id}`,
          callback_data: `run:${repoId}:${run.id}`
        }]),
        [
          { text: '🔄 بروزرسانی', callback_data: `runs:${repoId}` },
          { text: '🔙 پروژه', callback_data: `repo:${repoId}` }
        ]
      ]
    }
  };
}

async function workflowRunView(github, repoId, runId) {
  const [repo, run] = await Promise.all([
    github.getRepository(repoId),
    github.getWorkflowRun(repoId, runId)
  ]);
  const rows = [
    [{ text: '👷 Jobها', callback_data: `jobs:${repoId}:${runId}` }]
  ];
  if (run.conclusion === 'failure') {
    rows.push([{ text: '🔁 اجرای مجدد jobهای ناموفق', callback_data: `rerun:${repoId}:${runId}` }]);
  }
  if (run.status === 'in_progress' || run.status === 'queued') {
    rows.push([{ text: '⏹ لغو Workflow', callback_data: `cancelrun:${repoId}:${runId}` }]);
  }
  rows.push([
    { text: '🔄 بروزرسانی', callback_data: `run:${repoId}:${runId}` },
    { text: '🔙 CI / Actions', callback_data: `runs:${repoId}` }
  ]);

  return {
    text: `🧪 <b>${escapeHtml(run.name)} — ${escapeHtml(repo.name)}</b>\n➖➖➖➖➖➖➖➖➖➖\nوضعیت: ${runIcon(run)} <b>${escapeHtml(run.conclusion || run.status || 'unknown')}</b>\nRun: <code>#${escapeHtml(run.runNumber ?? run.id)}</code>\nBranch: <code>${escapeHtml(run.branch || '-')}</code>\nSHA: <code>${escapeHtml(run.sha || '-')}</code>\nTrigger: <code>${escapeHtml(run.event || '-')}</code>`,
    reply_markup: { inline_keyboard: rows }
  };
}

async function workflowJobsView(github, repoId, runId) {
  const [repo, run, jobs] = await Promise.all([
    github.getRepository(repoId),
    github.getWorkflowRun(repoId, runId),
    github.listWorkflowJobs(repoId, runId)
  ]);
  const body = jobs.length
    ? jobs.slice(0, 20).map(job => {
        const jobState = job.conclusion || job.status || 'unknown';
        const steps = (job.steps || []).slice(0, 30)
          .map(step => `  ${step.conclusion === 'success' ? '✅' : step.conclusion === 'failure' ? '❌' : '•'} ${escapeHtml(step.name)} — ${escapeHtml(step.conclusion || step.status || 'unknown')}`)
          .join('\n');
        return `<b>${escapeHtml(job.name)}</b> — ${escapeHtml(jobState)}${steps ? `\n${steps}` : ''}`;
      }).join('\n\n')
    : '<i>Jobی در این Run یافت نشد.</i>';

  return {
    text: `👷 <b>Jobهای ${escapeHtml(run.name)} — ${escapeHtml(repo.name)}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: {
      inline_keyboard: [[
        { text: '🔄 بروزرسانی', callback_data: `jobs:${repoId}:${runId}` },
        { text: '🔙 Run', callback_data: `run:${repoId}:${runId}` }
      ]]
    }
  };
}

function workflowActionResultView(repoId, runId, action) {
  const rerun = action === 'rerun_failed';
  return {
    text: rerun
      ? '✅ درخواست اجرای مجدد jobهای ناموفق برای GitHub ارسال شد.'
      : '✅ درخواست لغو Workflow برای GitHub ارسال شد.',
    reply_markup: {
      inline_keyboard: [[
        { text: '🧪 مشاهده Run', callback_data: `run:${repoId}:${runId}` },
        { text: '🔙 CI / Actions', callback_data: `runs:${repoId}` }
      ]]
    }
  };
}

function resolveReadCallback(data) {
  const value = String(data || '');
  if (value === 'menu:repos') return { actionId: 'github.repos.list', kind: 'legacy' };

  const repoId = numericSingle(value, 'repo');
  if (repoId !== null) return { actionId: 'github.repo.detail', kind: 'repo', repoId };

  const runsRepoId = numericSingle(value, 'runs');
  if (runsRepoId !== null) return { actionId: 'github.workflow.runs.list', kind: 'runs', repoId: runsRepoId };

  const run = numericPair(value, 'run');
  if (run) return { actionId: 'github.workflow.run.detail', kind: 'run', ...run };

  const jobs = numericPair(value, 'jobs');
  if (jobs) return { actionId: 'github.workflow.jobs.list', kind: 'jobs', ...jobs };

  for (const [prefix, actionId] of CALLBACK_ACTIONS) {
    if (value.startsWith(prefix)) return { actionId, kind: 'legacy' };
  }
  return null;
}

function resolveWriteCallback(data) {
  const rerun = numericPair(data, 'rerun');
  if (rerun) {
    return {
      actionId: 'github.workflow.run.rerun_failed',
      approval: {
        input: rerun,
        label: 'اجرای مجدد jobهای ناموفق'
      },
      execute: async github => {
        await github.rerunFailedWorkflowRun(rerun.repoId, rerun.runId);
        return workflowActionResultView(rerun.repoId, rerun.runId, 'rerun_failed');
      }
    };
  }

  const cancel = numericPair(data, 'cancelrun');
  if (cancel) {
    return {
      actionId: 'github.workflow.run.cancel',
      approval: {
        input: cancel,
        label: 'لغو Workflow در حال اجرا'
      },
      execute: async github => {
        await github.cancelWorkflowRun(cancel.repoId, cancel.runId);
        return workflowActionResultView(cancel.repoId, cancel.runId, 'cancel');
      }
    };
  }
  return null;
}

export function createGitHubPlugin({ github, menu } = {}) {
  if (!github) throw new Error('GitHub plugin requires github service');
  if (!menu) throw new Error('GitHub plugin requires menu manager');

  return {
    manifest: githubPluginManifest,

    resolveCommand(command) {
      if (command !== '/repos') return null;
      return {
        actionId: 'github.repos.list',
        execute: () => menu.getReposListView()
      };
    },

    resolveCallback(data) {
      const write = resolveWriteCallback(data);
      if (write) {
        return {
          actionId: write.actionId,
          approval: write.approval,
          execute: () => write.execute(github)
        };
      }

      const read = resolveReadCallback(data);
      if (!read) return null;

      return {
        actionId: read.actionId,
        execute: async () => {
          if (read.kind === 'repo') {
            return addCiButton(await menu.renderByCallback(data), read.repoId);
          }
          if (read.kind === 'runs') return workflowRunsView(github, read.repoId);
          if (read.kind === 'run') return workflowRunView(github, read.repoId, read.runId);
          if (read.kind === 'jobs') return workflowJobsView(github, read.repoId, read.runId);
          return menu.renderByCallback(data);
        }
      };
    }
  };
}
