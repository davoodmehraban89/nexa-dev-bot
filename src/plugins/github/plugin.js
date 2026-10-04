import { githubPluginManifest } from './manifest.js';
import { createWorkspaceController } from './workspace.js';

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

const short = (value, max = 80) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const numericPair = (value, prefix) => {
  const match = String(value || '').match(new RegExp(`^${prefix}:(\\d+):(\\d+)$`));
  if (!match) return null;
  return { repoId: Number(match[1]), runId: Number(match[2]) };
};

const numericTriple = (value, prefix) => {
  const match = String(value || '').match(new RegExp(`^${prefix}:(\\d+):(\\d+):(\\d+)$`));
  if (!match) return null;
  return {
    repoId: Number(match[1]),
    itemId: Number(match[2]),
    page: Math.max(1, Math.min(100, Number(match[3]) || 1))
  };
};

const pagedPair = (value, prefix) => {
  const match = String(value || '').match(new RegExp(`^${prefix}:(\\d+):(\\d+)(?::(\\d+))?$`));
  if (!match) return null;
  return {
    repoId: Number(match[1]),
    itemId: Number(match[2]),
    page: Math.max(1, Math.min(100, Number(match[3]) || 1))
  };
};

const numericSingle = (value, prefix) => {
  const match = String(value || '').match(new RegExp(`^${prefix}:(\\d+)$`));
  return match ? Number(match[1]) : null;
};

const pagedSingle = (value, prefix) => {
  const match = String(value || '').match(new RegExp(`^${prefix}:(\\d+)(?::(\\d+))?$`));
  if (!match) return null;
  return {
    repoId: Number(match[1]),
    page: Math.max(1, Math.min(100, Number(match[2]) || 1))
  };
};

const compareRef = value => {
  const match = String(value || '').match(/^compare:(\d+):([a-f0-9]{40})$/i);
  if (!match) return null;
  return { repoId: Number(match[1]), sha: match[2] };
};

const commitDetailRef = value => {
  const match = String(value || '').match(/^commitdetail:(\d+):([a-f0-9]{40})$/i);
  if (!match) return null;
  return { repoId: Number(match[1]), sha: match[2] };
};

const workflowRunsPage = value => pagedSingle(value, 'runs');

const runIcon = run => {
  if (run.conclusion === 'success') return '✅';
  if (run.conclusion === 'failure') return '❌';
  if (run.conclusion === 'cancelled') return '⏹';
  return run.status === 'in_progress' ? '🟡' : '⏳';
};

const stateIcon = value => {
  if (value === 'success' || value === 'completed') return '✅';
  if (value === 'failure') return '❌';
  if (value === 'cancelled') return '⏹';
  if (value === 'open') return '🟢';
  if (value === 'closed') return '⚫';
  return '•';
};

const addRepoAdvancedButtons = (view, repoId) => {
  const rows = [...(view?.reply_markup?.inline_keyboard || [])];
  const insertAt = Math.max(0, rows.length - 1);
  rows.splice(insertAt, 0,
    [{ text: '🧪 CI / Actions', callback_data: `runs:${repoId}` }],
    [{ text: '🌿 Branches', callback_data: `branches:${repoId}` }],
    [
      { text: '🐛 Issues', callback_data: `issues:${repoId}` },
      { text: '🏷 Releases', callback_data: `releases:${repoId}` }
    ]
  );
  return {
    ...view,
    reply_markup: { ...(view?.reply_markup || {}), inline_keyboard: rows }
  };
};

function listPagination(prefix, repoId, page, count, pageSize) {
  const row = [];
  if (page > 1) row.push({ text: '⬅️ جدیدتر', callback_data: `${prefix}:${repoId}:${page - 1}` });
  if (count === pageSize && page < 100) row.push({ text: 'قدیمی‌تر ➡️', callback_data: `${prefix}:${repoId}:${page + 1}` });
  return row.length ? [row] : [];
}

function explicitPagination(prefix, repoId, page, hasMore) {
  const row = [];
  if (page > 1) row.push({ text: '⬅️ جدیدتر', callback_data: `${prefix}:${repoId}:${page - 1}` });
  if (hasMore && page < 100) row.push({ text: 'قدیمی‌تر ➡️', callback_data: `${prefix}:${repoId}:${page + 1}` });
  return row.length ? [row] : [];
}

function pairPagination(prefix, repoId, itemId, page, count, pageSize) {
  const row = [];
  if (page > 1) row.push({ text: '⬅️ جدیدتر', callback_data: `${prefix}:${repoId}:${itemId}:${page - 1}` });
  if (count === pageSize && page < 100) row.push({ text: 'قدیمی‌تر ➡️', callback_data: `${prefix}:${repoId}:${itemId}:${page + 1}` });
  return row.length ? [row] : [];
}

async function commitsView(github, repoId) {
  const [repo, commits] = await Promise.all([github.getRepository(repoId), github.listCommits(repoId)]);
  const body = commits.length
    ? commits.slice(0, 10).map(commit => `• <code>${escapeHtml(commit.shortSha || commit.sha)}</code> — ${escapeHtml(short(commit.message, 110))}\n  ${escapeHtml(commit.author || 'Unknown')}${commit.date ? ` · ${escapeHtml(commit.date)}` : ''}`).join('\n\n')
    : '<i>کامیتی در پاسخ GitHub یافت نشد.</i>';
  const detailRows = commits.slice(0, 10).map(commit => {
    const sha = String(commit.fullSha || commit.sha || '');
    return /^[a-f0-9]{40}$/i.test(sha)
      ? [{ text: `📝 ${short(commit.message || sha.slice(0, 7), 42)}`, callback_data: `commitdetail:${repoId}:${sha}` }]
      : null;
  }).filter(Boolean);
  return {
    text: `📝 <b>آخرین Commitهای ${escapeHtml(repo.name)}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [
      ...detailRows,
      [{ text: '🔄 بروزرسانی', callback_data: `commits:${repoId}` }, { text: '🔙 پروژه', callback_data: `repo:${repoId}` }]
    ] }
  };
}

async function commitDetailView(github, repoId, sha) {
  const [repo, commit] = await Promise.all([github.getRepository(repoId), github.getCommit(repoId, sha)]);
  const files = (commit.files || []).slice(0, 12)
    .map(file => `• <code>${escapeHtml(short(file.filename, 90))}</code> · ${escapeHtml(file.status || 'changed')} · +${file.additions ?? 0}/-${file.deletions ?? 0}`)
    .join('\n');
  return {
    text: `📝 <b>Commit — ${escapeHtml(repo.name)}</b>\n<code>${escapeHtml(commit.shortSha || String(commit.sha).slice(0, 7))}</code> · ${escapeHtml(commit.author || 'Unknown')}\n${escapeHtml(commit.date || '-')}\n+${commit.additions ?? 0}/-${commit.deletions ?? 0} · ${commit.changedFiles ?? (commit.files || []).length} files\n➖➖➖➖➖➖➖➖➖➖\n${escapeHtml(short(commit.message || '', 1200)) || '<i>بدون پیام.</i>'}\n\n<b>فایل‌های تغییرکرده</b>\n${files || '<i>فایلی گزارش نشده است.</i>'}`,
    reply_markup: { inline_keyboard: [[{ text: '🔄 بروزرسانی', callback_data: `commitdetail:${repoId}:${sha}` }, { text: '🔙 Commitها', callback_data: `commits:${repoId}` }], [{ text: '🔙 پروژه', callback_data: `repo:${repoId}` }]] }
  };
}

async function workflowRunsView(github, repoId, page = 1) {
  const [repo, runs] = await Promise.all([
    github.getRepository(repoId),
    github.listWorkflowRuns(repoId, { perPage: 10, page })
  ]);
  const body = runs.length
    ? runs.slice(0, 10).map(run => `${runIcon(run)} <b>${escapeHtml(run.name)}</b> #${run.runNumber ?? '-'}\n  └ ${escapeHtml(run.branch || '-')} · <code>${escapeHtml(run.sha || '-')}</code> · ${escapeHtml(run.conclusion || run.status || 'unknown')}`).join('\n\n')
    : '<i>Workflow runی یافت نشد.</i>';
  const refreshCallback = page === 1 ? `runs:${repoId}` : `runs:${repoId}:${page}`;
  return {
    text: `🧪 <b>CI / Actions — ${escapeHtml(repo.name)}</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: {
      inline_keyboard: [
        ...runs.slice(0, 10).map(run => [{
          text: `${runIcon(run)} ${short(run.name, 32)} #${run.runNumber ?? run.id}`,
          callback_data: `run:${repoId}:${run.id}`
        }]),
        ...listPagination('runs', repoId, page, runs.length, 10),
        [
          { text: '🔄 بروزرسانی', callback_data: refreshCallback },
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
    [
      { text: '👷 Jobها', callback_data: `jobs:${repoId}:${runId}` },
      { text: '📦 Artifacts', callback_data: `artifacts:${repoId}:${runId}` }
    ]
  ];
  if (run.conclusion === 'failure') rows.push([{ text: '🔁 اجرای مجدد jobهای ناموفق', callback_data: `rerun:${repoId}:${runId}` }]);
  if (run.status === 'in_progress' || run.status === 'queued') rows.push([{ text: '⏹ لغو Workflow', callback_data: `cancelrun:${repoId}:${runId}` }]);
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
          .map(step => `  ${stateIcon(step.conclusion || step.status)} ${escapeHtml(step.name)} — ${escapeHtml(step.conclusion || step.status || 'unknown')}`)
          .join('\n');
        return `<b>${escapeHtml(job.name)}</b> — ${escapeHtml(jobState)}${steps ? `\n${steps}` : ''}`;
      }).join('\n\n')
    : '<i>Jobی در این Run یافت نشد.</i>';
  return {
    text: `👷 <b>Jobهای ${escapeHtml(run.name)} — ${escapeHtml(repo.name)}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: {
      inline_keyboard: [
        ...jobs.slice(0, 20).map(job => [{ text: `${stateIcon(job.conclusion || job.status)} ${short(job.name, 40)}`, callback_data: `job:${repoId}:${job.id}` }]),
        [{ text: '🔄 بروزرسانی', callback_data: `jobs:${repoId}:${runId}` }, { text: '🔙 Run', callback_data: `run:${repoId}:${runId}` }]
      ]
    }
  };
}

async function workflowJobView(github, repoId, jobId) {
  const [repo, job] = await Promise.all([github.getRepository(repoId), github.getWorkflowJob(repoId, jobId)]);
  const status = job.conclusion || job.status || 'unknown';
  const steps = (job.steps || []).slice(0, 30).map(step => `${stateIcon(step.conclusion || step.status)} ${escapeHtml(step.name)} — ${escapeHtml(step.conclusion || step.status || 'unknown')}`).join('\n');
  const rows = [];
  if (job.conclusion === 'failure') rows.push([{ text: '📜 مشاهده log ناموفق', callback_data: `joblog:${repoId}:${jobId}` }]);
  rows.push([{ text: '🔄 بروزرسانی', callback_data: `job:${repoId}:${jobId}` }, { text: '🔙 CI / Actions', callback_data: `runs:${repoId}` }]);
  return {
    text: `👷 <b>${escapeHtml(job.name)} — ${escapeHtml(repo.name)}</b>\nوضعیت: ${stateIcon(status)} <b>${escapeHtml(status)}</b>\n➖➖➖➖➖➖➖➖➖➖\n${steps || '<i>Stepی ثبت نشده.</i>'}`,
    reply_markup: { inline_keyboard: rows }
  };
}

async function workflowJobLogView(github, repoId, jobId) {
  const [job, log] = await Promise.all([
    github.getWorkflowJob(repoId, jobId),
    github.getWorkflowJobLog(repoId, jobId, { maxChars: 1800 })
  ]);
  const escaped = escapeHtml(log.text).slice(-3200);
  const note = log.truncated ? '⚠️ فقط بخش پایانی log نمایش داده شده است.\n\n' : '';
  return {
    text: `📜 <b>Log — ${escapeHtml(job.name)}</b>\n${note}<pre>${escaped || '(empty log)'}</pre>`,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Job', callback_data: `job:${repoId}:${jobId}` }]] }
  };
}

async function workflowArtifactsView(github, repoId, runId, page = 1) {
  const [repo, artifacts] = await Promise.all([
    github.getRepository(repoId),
    github.listWorkflowArtifacts(repoId, runId, { perPage: 10, page })
  ]);
  const body = artifacts.length
    ? artifacts.slice(0, 10).map(item => `📦 <b>${escapeHtml(item.name)}</b>\n  ${item.expired ? 'منقضی شده' : 'فعال'} · ${Number(item.size || 0).toLocaleString()} bytes\n  expires: ${escapeHtml(item.expiresAt || '-')}`).join('\n\n')
    : '<i>Artifactی برای این Run یافت نشد.</i>';
  const refreshCallback = page === 1 ? `artifacts:${repoId}:${runId}` : `artifacts:${repoId}:${runId}:${page}`;
  return {
    text: `📦 <b>Artifacts — ${escapeHtml(repo.name)}</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [...pairPagination('artifacts', repoId, runId, page, artifacts.length, 10), [{ text: '🔄 بروزرسانی', callback_data: refreshCallback }, { text: '🔙 Run', callback_data: `run:${repoId}:${runId}` }]] }
  };
}

async function branchesView(github, repoId, page = 1) {
  const [repo, branches] = await Promise.all([github.getRepository(repoId), github.listBranches(repoId, { perPage: 20, page })]);
  const body = branches.length
    ? branches.slice(0, 20).map(branch => `🌿 <b>${escapeHtml(short(branch.name, 70))}</b>\n  <code>${escapeHtml(String(branch.sha).slice(0, 10))}</code>${branch.protected ? ' · 🛡 protected' : ''}`).join('\n\n')
    : '<i>Branchی یافت نشد.</i>';
  return {
    text: `🌿 <b>Branches — ${escapeHtml(repo.name)}</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [
      ...branches.slice(0, 20).filter(branch => /^[a-f0-9]{40}$/i.test(String(branch.sha))).map(branch => [{ text: `↔️ ${short(branch.name, 42)}`, callback_data: `compare:${repoId}:${branch.sha}` }]),
      ...listPagination('branches', repoId, page, branches.length, 20),
      [{ text: '🔙 پروژه', callback_data: `repo:${repoId}` }]
    ] }
  };
}

async function compareView(github, repoId, sha) {
  const [repo, compare] = await Promise.all([github.getRepository(repoId), github.compareWithDefault(repoId, sha)]);
  const files = (compare.files || []).slice(0, 12).map(file => `${stateIcon(file.status)} <code>${escapeHtml(short(file.filename, 90))}</code> · +${file.additions}/-${file.deletions}`).join('\n');
  return {
    text: `↔️ <b>Compare — ${escapeHtml(repo.name)}</b>\n<code>${escapeHtml(compare.base)}</code> ← <code>${escapeHtml(String(compare.head).slice(0, 10))}</code>\nوضعیت: <b>${escapeHtml(compare.status || '-')}</b>\nAhead: <b>${compare.aheadBy ?? 0}</b> · Behind: <b>${compare.behindBy ?? 0}</b> · Commits: <b>${compare.totalCommits ?? 0}</b>\n➖➖➖➖➖➖➖➖➖➖\n${files || '<i>فایل تغییریافته‌ای نیست.</i>'}`,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Branches', callback_data: `branches:${repoId}` }]] }
  };
}

async function pullRequestsView(github, repoId, page = 1) {
  const [repo, prs] = await Promise.all([github.getRepository(repoId), github.listPullRequests(repoId, { perPage: 10, page })]);
  const body = prs.length
    ? prs.slice(0, 10).map(pr => `${pr.merged ? '🟣' : stateIcon(pr.state)} <b>#${pr.number} ${escapeHtml(short(pr.title, 100))}</b>\n  ${escapeHtml(pr.author)} · ${escapeHtml(pr.merged ? 'merged' : pr.state)}`).join('\n\n')
    : '<i>Pull Requestی یافت نشد.</i>';
  return {
    text: `🔎 <b>Pull Requests — ${escapeHtml(repo.name)}</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [
      ...prs.slice(0, 10).map(pr => [{ text: `#${pr.number} ${short(pr.title, 42)}`, callback_data: `prdetail:${repoId}:${pr.number}` }]),
      ...listPagination('prs', repoId, page, prs.length, 10),
      [{ text: '🔙 پروژه', callback_data: `repo:${repoId}` }]
    ] }
  };
}

async function pullRequestDetailView(github, repoId, prNumber) {
  const [repo, pr] = await Promise.all([github.getRepository(repoId), github.getPullRequest(repoId, prNumber)]);
  const body = escapeHtml(short(pr.body || '', 600));
  return {
    text: `🔎 <b>PR #${pr.number} — ${escapeHtml(repo.name)}</b>\n<b>${escapeHtml(pr.title)}</b>\n${pr.merged ? '🟣 merged' : `${stateIcon(pr.state)} ${escapeHtml(pr.state)}`} · ${escapeHtml(pr.author)}\n<code>${escapeHtml(pr.head || '-')}</code> → <code>${escapeHtml(pr.base || '-')}</code>\n+${pr.additions}/-${pr.deletions} · ${pr.changedFiles} files\n➖➖➖➖➖➖➖➖➖➖\n${body || '<i>بدون توضیح.</i>'}`,
    reply_markup: { inline_keyboard: [[{ text: '🧩 فایل‌ها / Diff', callback_data: `prfiles:${repoId}:${prNumber}:1` }, { text: '✅ Checks', callback_data: `prchecks:${repoId}:${prNumber}:1` }], [{ text: '🔙 PRها', callback_data: `prs:${repoId}` }]] }
  };
}

async function pullRequestFilesView(github, repoId, prNumber, page = 1) {
  const files = await github.listPullRequestFiles(repoId, prNumber, { perPage: 8, page });
  const body = files.length ? files.slice(0, 8).map(file => {
    const patch = escapeHtml(short(file.patch || '', 220));
    return `🧩 <code>${escapeHtml(short(file.filename, 100))}</code> · ${escapeHtml(file.status)} · +${file.additions}/-${file.deletions}${patch ? `\n<pre>${patch}</pre>` : ''}`;
  }).join('\n\n') : '<i>فایل تغییریافته‌ای یافت نشد.</i>';
  return {
    text: `🧩 <b>PR #${prNumber} Files / Diff</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [...pairPagination('prfiles', repoId, prNumber, page, files.length, 8), [{ text: '🔙 PR', callback_data: `prdetail:${repoId}:${prNumber}` }]] }
  };
}

async function pullRequestChecksView(github, repoId, prNumber, page = 1) {
  const pr = await github.getPullRequest(repoId, prNumber);
  const checks = await github.listCommitChecks(repoId, pr.headSha, { perPage: 20, page });
  const body = checks.length
    ? checks.slice(0, 20).map(check => `${stateIcon(check.conclusion || check.status)} <b>${escapeHtml(check.name)}</b> — ${escapeHtml(check.conclusion || check.status || 'unknown')}`).join('\n')
    : '<i>Checkی یافت نشد.</i>';
  return {
    text: `✅ <b>PR #${prNumber} Checks</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [...pairPagination('prchecks', repoId, prNumber, page, checks.length, 20), [{ text: '🔙 PR', callback_data: `prdetail:${repoId}:${prNumber}` }]] }
  };
}

async function issuesView(github, repoId, page = 1) {
  const [repo, issuePage] = await Promise.all([github.getRepository(repoId), github.listIssuesPage(repoId, { page })]);
  const issues = issuePage.items || [];
  const body = issues.length
    ? issues.slice(0, 20).map(issue => `${stateIcon(issue.state)} <b>#${issue.number} ${escapeHtml(short(issue.title, 110))}</b>\n  ${escapeHtml(issue.author)} · ${issue.comments} comments`).join('\n\n')
    : '<i>Issueی یافت نشد.</i>';
  return {
    text: `🐛 <b>Issues — ${escapeHtml(repo.name)}</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [
      ...issues.slice(0, 20).map(issue => [{ text: `#${issue.number} ${short(issue.title, 42)}`, callback_data: `issuedetail:${repoId}:${issue.number}` }]),
      ...explicitPagination('issues', repoId, page, !!issuePage.hasMore),
      [{ text: '🔙 پروژه', callback_data: `repo:${repoId}` }]
    ] }
  };
}

async function issueDetailView(github, repoId, issueNumber) {
  const [repo, issue] = await Promise.all([github.getRepository(repoId), github.getIssue(repoId, issueNumber)]);
  const labels = (issue.labels || []).map(label => `#${escapeHtml(label)}`).join(' ');
  const assignees = (issue.assignees || []).map(name => `@${escapeHtml(name)}`).join(' ');
  const body = escapeHtml(short(issue.body || '', 1800));
  return {
    text: `🐛 <b>Issue #${issue.number} — ${escapeHtml(repo.name)}</b>\n<b>${escapeHtml(issue.title)}</b>\n${stateIcon(issue.state)} ${escapeHtml(issue.state || 'unknown')} · ${escapeHtml(issue.author)} · ${issue.comments ?? 0} comments\nLabels: ${labels || '-'}\nAssignees: ${assignees || '-'}\nUpdated: ${escapeHtml(issue.updatedAt || issue.createdAt || '-')}\n➖➖➖➖➖➖➖➖➖➖\n${body || '<i>بدون توضیح.</i>'}`,
    reply_markup: { inline_keyboard: [[{ text: '🔄 بروزرسانی', callback_data: `issuedetail:${repoId}:${issueNumber}` }, { text: '🔙 Issues', callback_data: `issues:${repoId}` }]] }
  };
}

async function releasesView(github, repoId, page = 1) {
  const [repo, releases] = await Promise.all([github.getRepository(repoId), github.listReleases(repoId, { perPage: 10, page })]);
  const body = releases.length
    ? releases.slice(0, 10).map(release => `🏷 <b>${escapeHtml(release.tag || release.name)}</b>${release.prerelease ? ' · pre-release' : ''}${release.draft ? ' · draft' : ''}\n  ${escapeHtml(short(release.name, 110))}\n  ${escapeHtml(release.publishedAt || '-')}`).join('\n\n')
    : '<i>هیچ Release منتشرشده‌ای برای این مخزن در GitHub وجود ندارد.</i>';
  return {
    text: `🏷 <b>Releases — ${escapeHtml(repo.name)}</b>\nصفحه: <b>${page}</b>\n➖➖➖➖➖➖➖➖➖➖\n${body}`,
    reply_markup: { inline_keyboard: [
      ...releases.slice(0, 10).map(release => [{ text: `🏷 ${short(release.tag || release.name, 42)}`, callback_data: `releasedetail:${repoId}:${release.id}` }]),
      ...listPagination('releases', repoId, page, releases.length, 10),
      [{ text: '🔙 پروژه', callback_data: `repo:${repoId}` }]
    ] }
  };
}

async function releaseDetailView(github, repoId, releaseId) {
  const [repo, release] = await Promise.all([github.getRepository(repoId), github.getRelease(repoId, releaseId)]);
  const body = escapeHtml(short(release.body || '', 1800));
  const flags = [release.draft ? 'draft' : '', release.prerelease ? 'pre-release' : ''].filter(Boolean).join(' · ');
  return {
    text: `🏷 <b>${escapeHtml(release.name)} — ${escapeHtml(repo.name)}</b>\nTag: <code>${escapeHtml(release.tag || '-')}</code>\nTarget: <code>${escapeHtml(release.target || '-')}</code>\nAuthor: ${escapeHtml(release.author || 'unknown')}\nPublished: ${escapeHtml(release.publishedAt || '-')}${flags ? `\nState: ${escapeHtml(flags)}` : ''}\n➖➖➖➖➖➖➖➖➖➖\n${body || '<i>بدون Release notes.</i>'}`,
    reply_markup: { inline_keyboard: [[{ text: '🔄 بروزرسانی', callback_data: `releasedetail:${repoId}:${releaseId}` }, { text: '🔙 Releases', callback_data: `releases:${repoId}` }]] }
  };
}

function workflowActionResultView(repoId, runId, action) {
  const rerun = action === 'rerun_failed';
  return {
    text: rerun ? '✅ درخواست اجرای مجدد jobهای ناموفق برای GitHub ارسال شد.' : '✅ درخواست لغو Workflow برای GitHub ارسال شد.',
    reply_markup: { inline_keyboard: [[{ text: '🧪 مشاهده Run', callback_data: `run:${repoId}:${runId}` }, { text: '🔙 CI / Actions', callback_data: `runs:${repoId}` }]] }
  };
}

function resolveReadCallback(data) {
  const value = String(data || '');
  if (value === 'menu:repos') return { actionId: 'github.repos.list', kind: 'legacy' };
  const repoId = numericSingle(value, 'repo');
  if (repoId !== null) return { actionId: 'github.repo.detail', kind: 'repo', repoId };
  const commits = numericSingle(value, 'commits');
  if (commits !== null) return { actionId: 'github.commits.list', kind: 'commits', repoId: commits };
  const commitdetail = commitDetailRef(value);
  if (commitdetail) return { actionId: 'github.commit.detail', kind: 'commitdetail', ...commitdetail };
  const runs = workflowRunsPage(value);
  if (runs) return { actionId: 'github.workflow.runs.list', kind: 'runs', ...runs };
  const run = numericPair(value, 'run');
  if (run) return { actionId: 'github.workflow.run.detail', kind: 'run', ...run };
  const jobs = numericPair(value, 'jobs');
  if (jobs) return { actionId: 'github.workflow.jobs.list', kind: 'jobs', ...jobs };
  const job = numericPair(value, 'job');
  if (job) return { actionId: 'github.workflow.job.detail', kind: 'job', repoId: job.repoId, jobId: job.runId };
  const joblog = numericPair(value, 'joblog');
  if (joblog) return { actionId: 'github.workflow.job.log', kind: 'joblog', repoId: joblog.repoId, jobId: joblog.runId };
  const artifacts = pagedPair(value, 'artifacts');
  if (artifacts) return { actionId: 'github.workflow.artifacts.list', kind: 'artifacts', repoId: artifacts.repoId, runId: artifacts.itemId, page: artifacts.page };
  const branches = pagedSingle(value, 'branches');
  if (branches) return { actionId: 'github.branches.list', kind: 'branches', ...branches };
  const compare = compareRef(value);
  if (compare) return { actionId: 'github.compare.read', kind: 'compare', ...compare };
  const legacyPr = numericSingle(value, 'pr');
  if (legacyPr !== null) return { actionId: 'github.pr.advanced.list', kind: 'prs', repoId: legacyPr, page: 1 };
  const prs = pagedSingle(value, 'prs');
  if (prs) return { actionId: 'github.pr.advanced.list', kind: 'prs', ...prs };
  const prdetail = numericPair(value, 'prdetail');
  if (prdetail) return { actionId: 'github.pr.detail', kind: 'prdetail', repoId: prdetail.repoId, prNumber: prdetail.runId };
  const prfiles = numericTriple(value, 'prfiles');
  if (prfiles) return { actionId: 'github.pr.files.list', kind: 'prfiles', repoId: prfiles.repoId, prNumber: prfiles.itemId, page: prfiles.page };
  const prchecks = numericTriple(value, 'prchecks');
  if (prchecks) return { actionId: 'github.pr.checks.list', kind: 'prchecks', repoId: prchecks.repoId, prNumber: prchecks.itemId, page: prchecks.page };
  const issues = pagedSingle(value, 'issues');
  if (issues) return { actionId: 'github.issues.list', kind: 'issues', ...issues };
  const issuedetail = numericPair(value, 'issuedetail');
  if (issuedetail) return { actionId: 'github.issue.detail', kind: 'issuedetail', repoId: issuedetail.repoId, issueNumber: issuedetail.runId };
  const releases = pagedSingle(value, 'releases');
  if (releases) return { actionId: 'github.releases.list', kind: 'releases', ...releases };
  const releasedetail = numericPair(value, 'releasedetail');
  if (releasedetail) return { actionId: 'github.release.detail', kind: 'releasedetail', repoId: releasedetail.repoId, releaseId: releasedetail.runId };
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
      approval: { input: rerun, label: 'اجرای مجدد jobهای ناموفق' },
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
      approval: { input: cancel, label: 'لغو Workflow در حال اجرا' },
      execute: async github => {
        await github.cancelWorkflowRun(cancel.repoId, cancel.runId);
        return workflowActionResultView(cancel.repoId, cancel.runId, 'cancel');
      }
    };
  }
  return null;
}

export function createGitHubPlugin({ github, menu, workspaces } = {}) {
  if (!github) throw new Error('GitHub plugin requires github service');
  if (!menu) throw new Error('GitHub plugin requires menu manager');
  const workspaceController = workspaces ? createWorkspaceController({ github, workspaces }) : null;

  return {
    manifest: githubPluginManifest,

    resolveCommand(command) {
      if (command !== '/repos') return null;
      return { actionId: 'github.repos.list', execute: () => menu.getReposListView() };
    },

    resolveMessage(payload, context = {}) {
      return workspaceController?.resolveMessage(payload, context) || null;
    },

    resolveCallback(data, context = {}) {
      const write = resolveWriteCallback(data);
      if (write) return { actionId: write.actionId, approval: write.approval, execute: () => write.execute(github) };

      const workspaceRoute = workspaceController?.resolveCallback(data, context);
      if (workspaceRoute) return workspaceRoute;

      const read = resolveReadCallback(data);
      if (!read) return null;
      return {
        actionId: read.actionId,
        execute: async () => {
          if (read.kind === 'repo') return addRepoAdvancedButtons(await menu.renderByCallback(data), read.repoId);
          if (read.kind === 'commits') return typeof github.listCommits === 'function' ? commitsView(github, read.repoId) : menu.renderByCallback(data);
          if (read.kind === 'commitdetail') return commitDetailView(github, read.repoId, read.sha);
          if (read.kind === 'runs') return workflowRunsView(github, read.repoId, read.page);
          if (read.kind === 'run') return workflowRunView(github, read.repoId, read.runId);
          if (read.kind === 'jobs') return workflowJobsView(github, read.repoId, read.runId);
          if (read.kind === 'job') return workflowJobView(github, read.repoId, read.jobId);
          if (read.kind === 'joblog') return workflowJobLogView(github, read.repoId, read.jobId);
          if (read.kind === 'artifacts') return workflowArtifactsView(github, read.repoId, read.runId, read.page);
          if (read.kind === 'branches') return branchesView(github, read.repoId, read.page);
          if (read.kind === 'compare') return compareView(github, read.repoId, read.sha);
          if (read.kind === 'prs') return pullRequestsView(github, read.repoId, read.page);
          if (read.kind === 'prdetail') return pullRequestDetailView(github, read.repoId, read.prNumber);
          if (read.kind === 'prfiles') return pullRequestFilesView(github, read.repoId, read.prNumber, read.page);
          if (read.kind === 'prchecks') return pullRequestChecksView(github, read.repoId, read.prNumber, read.page);
          if (read.kind === 'issues') return issuesView(github, read.repoId, read.page);
          if (read.kind === 'issuedetail') return issueDetailView(github, read.repoId, read.issueNumber);
          if (read.kind === 'releases') return releasesView(github, read.repoId, read.page);
          if (read.kind === 'releasedetail') return releaseDetailView(github, read.repoId, read.releaseId);
          return menu.renderByCallback(data);
        }
      };
    }
  };
}
