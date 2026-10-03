import { DEFAULT_CONFIG } from './config.js';

const clampPage = value => Math.max(1, Math.min(100, Number(value) || 1));
const clampPerPage = (value, fallback = 10) => Math.max(1, Math.min(20, Number(value) || fallback));
const boundedPatch = value => String(value || '').slice(0, 1200);
const numericId = (value, label) => {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label} ID`);
  return text;
};
const fullSha = (value, label = 'Git commit') => {
  const text = String(value || '');
  if (!/^[a-f0-9]{40}$/i.test(text)) throw new Error(`Invalid ${label} SHA`);
  return text;
};

export class GitHubService {
  constructor(token = '', owner = DEFAULT_CONFIG.defaultOwner) {
    this.token = token;
    this.owner = owner;
    this.baseUrl = 'https://api.github.com';
  }

  requireToken() {
    if (!this.token) throw new Error('GITHUB_TOKEN is not configured');
  }

  getHeaders() {
    this.requireToken();
    return {
      'User-Agent': 'Nexa-Dev-Bot-v1.1',
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  async requestJson(url, label, { method = 'GET', body, allowEmpty = false } = {}) {
    const headers = this.getHeaders();
    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
      options.headers = { ...headers, 'Content-Type': 'application/json' };
    }
    const res = await fetch(url, options);
    const raw = await res.text();
    let parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }
    if (!res.ok) {
      const providerMessage = parsed?.message || raw.slice(0, 240);
      const detail = providerMessage ? ` ${providerMessage}` : '';
      throw new Error(`${label} failed: ${res.status}${detail}`);
    }
    if (allowEmpty) return { accepted: true, status: res.status };
    if (!raw) return null;
    if (parsed === null) throw new Error(`${label} failed: invalid JSON response`);
    return parsed;
  }

  async requestText(url, label, { maxChars = 12000 } = {}) {
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    const raw = await res.text();
    if (!res.ok) {
      const detail = raw ? ` ${raw.slice(0, 240)}` : '';
      throw new Error(`${label} failed: ${res.status}${detail}`);
    }
    const limit = Math.max(1, Math.min(20000, Number(maxChars) || 12000));
    return { text: raw.length > limit ? raw.slice(-limit) : raw, truncated: raw.length > limit };
  }

  repoUrl(repo, suffix = '') {
    return `${this.baseUrl}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(repo)}${suffix}`;
  }

  repositoryLookupUrl(repoRef) {
    const value = String(repoRef || '');
    return /^\d+$/.test(value) ? `${this.baseUrl}/repositories/${value}` : this.repoUrl(value);
  }

  repositoryApiBase(fullName) {
    const parts = String(fullName || '').split('/').filter(Boolean);
    if (parts.length !== 2) throw new Error('GitHub repository full_name is invalid');
    return `${this.baseUrl}/repos/${parts.map(encodeURIComponent).join('/')}`;
  }

  async getRepositoryContext(repoRef) {
    const raw = await this.requestJson(this.repositoryLookupUrl(repoRef), 'GitHub repository');
    return { raw, apiBase: this.repositoryApiBase(raw.full_name) };
  }

  mapRepository(r) {
    return {
      id: String(r.id ?? r.name), name: r.name, fullName: r.full_name, private: !!r.private,
      description: r.description || '', defaultBranch: r.default_branch || 'main', archived: !!r.archived,
      htmlUrl: r.html_url || '', stars: r.stargazers_count ?? 0, forks: r.forks_count ?? 0
    };
  }

  mapWorkflowRun(run = {}) {
    return {
      id: run.id, name: run.name || 'Workflow', status: run.status || '', conclusion: run.conclusion || null,
      event: run.event || '', branch: run.head_branch || '', sha: String(run.head_sha || '').slice(0, 7),
      runNumber: run.run_number ?? null, url: run.html_url || '', createdAt: run.created_at || '', updatedAt: run.updated_at || ''
    };
  }

  mapWorkflowJob(job = {}) {
    return {
      id: job.id, name: job.name || 'Job', status: job.status || '', conclusion: job.conclusion || null,
      startedAt: job.started_at || '', completedAt: job.completed_at || '', url: job.html_url || '',
      steps: (job.steps || []).slice(0, 30).map(step => ({
        number: step.number, name: step.name || 'Step', status: step.status || '', conclusion: step.conclusion || null
      }))
    };
  }

  mapPullRequestFile(file = {}) {
    return {
      filename: file.filename || '', status: file.status || '', additions: file.additions ?? 0,
      deletions: file.deletions ?? 0, changes: file.changes ?? 0, patch: boundedPatch(file.patch)
    };
  }

  async listRepositories() {
    const data = await this.requestJson(`${this.baseUrl}/user/repos?sort=updated&per_page=20&affiliation=owner,collaborator,organization_member`, 'GitHub repositories');
    return data.map(r => { const repo = this.mapRepository(r); return { ...repo, title: `${repo.name} ${repo.private ? '🔒' : '🌐'}` }; });
  }

  async getRepository(repoRef) {
    const { raw } = await this.getRepositoryContext(repoRef);
    return this.mapRepository(raw);
  }

  async listPullRequests(repoRef, { perPage = 10, page = 1 } = {}) {
    const count = clampPerPage(perPage, 10);
    const pageNumber = clampPage(page);
    const pageQuery = pageNumber > 1 ? `&page=${pageNumber}` : '';
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/pulls?state=all&per_page=${count}${pageQuery}`, 'GitHub pull requests');
    return data.map(pr => ({
      number: pr.number, title: pr.title, author: pr.user?.login || 'unknown', state: pr.state,
      merged: !!pr.merged_at, createdAt: pr.created_at, url: pr.html_url
    }));
  }

  async getPullRequest(repoRef, prNumber) {
    const number = numericId(prNumber, 'pull request');
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const pr = await this.requestJson(`${apiBase}/pulls/${number}`, 'GitHub pull request');
    return {
      number: pr.number, title: pr.title || '', author: pr.user?.login || 'unknown', state: pr.state || '',
      merged: !!(pr.merged ?? pr.merged_at), body: pr.body || '', url: pr.html_url || '', head: pr.head?.ref || '',
      headSha: pr.head?.sha || '', base: pr.base?.ref || '', additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0, changedFiles: pr.changed_files ?? 0
    };
  }

  async listPullRequestFiles(repoRef, prNumber, { perPage = 20, page = 1 } = {}) {
    const number = numericId(prNumber, 'pull request');
    const count = clampPerPage(perPage, 20); const pageNumber = clampPage(page);
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/pulls/${number}/files?per_page=${count}&page=${pageNumber}`, 'GitHub pull request files');
    return data.map(file => this.mapPullRequestFile(file));
  }

  async listCommits(repoRef) {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/commits?per_page=5`, 'GitHub commits');
    return data.map(c => ({
      sha: c.sha.slice(0, 7), message: String(c.commit?.message || '').split('\n')[0],
      author: c.author?.login || c.commit?.author?.name || 'Unknown', date: c.commit?.author?.date ? c.commit.author.date.slice(0, 10) : ''
    }));
  }

  async listCommitChecks(repoRef, sha, { perPage = 20, page = 1 } = {}) {
    const commitSha = fullSha(sha); const count = clampPerPage(perPage, 20); const pageNumber = clampPage(page);
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/commits/${commitSha}/check-runs?per_page=${count}&page=${pageNumber}`, 'GitHub check runs');
    return (data.check_runs || []).map(check => ({ id: check.id, name: check.name || 'Check', status: check.status || '', conclusion: check.conclusion || null, url: check.html_url || '' }));
  }

  async listFiles(repoRef, path = '') {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const suffix = path ? `/contents/${path.split('/').map(encodeURIComponent).join('/')}` : '/contents';
    const data = await this.requestJson(`${apiBase}${suffix}`, 'GitHub contents');
    if (!Array.isArray(data)) throw new Error('GitHub contents response is not a directory listing');
    return data.map(item => ({ name: item.name, path: item.path, type: item.type === 'dir' ? 'dir' : 'file', size: item.size ?? 0, sha: item.sha || '' }));
  }

  async listTree(repoRef, sha) {
    if (!/^[a-f0-9]{40}$/i.test(String(sha || ''))) throw new Error('Invalid Git tree SHA');
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/git/trees/${encodeURIComponent(sha)}`, 'GitHub tree');
    return (data.tree || []).filter(item => item.type === 'tree' || item.type === 'blob').map(item => ({
      name: item.path, path: item.path, type: item.type === 'tree' ? 'dir' : 'file', size: item.size ?? 0, sha: item.sha || ''
    }));
  }

  async getBlob(repoRef, sha) {
    if (!/^[a-f0-9]{40}$/i.test(String(sha || ''))) throw new Error('Invalid Git blob SHA');
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/git/blobs/${encodeURIComponent(sha)}`, 'GitHub blob');
    return { encoding: data.encoding || '', size: data.size ?? 0, content: data.content || '' };
  }

  async getRepoStatus(repoRef) {
    const { raw, apiBase } = await this.getRepositoryContext(repoRef);
    const runsData = await this.requestJson(`${apiBase}/actions/runs?per_page=3`, 'GitHub Actions runs');
    const runs = runsData.workflow_runs || [];
    return {
      repo: String(repoRef), repoName: raw.name, defaultBranch: raw.default_branch || 'main',
      lastRuns: runs.map(r => ({ name: r.name, status: r.status, conclusion: r.conclusion, commit: r.head_commit?.message?.slice(0, 80) || '', url: r.html_url || '' }))
    };
  }

  async listWorkflowRuns(repoRef, { perPage = 10, page = 1 } = {}) {
    const count = clampPerPage(perPage, 10); const pageNumber = clampPage(page);
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const pageQuery = pageNumber > 1 ? `&page=${pageNumber}` : '';
    const data = await this.requestJson(`${apiBase}/actions/runs?per_page=${count}${pageQuery}`, 'GitHub workflow runs');
    return (data.workflow_runs || []).map(run => this.mapWorkflowRun(run));
  }

  async getWorkflowRun(repoRef, runId) {
    const id = numericId(runId, 'workflow run'); const { apiBase } = await this.getRepositoryContext(repoRef);
    return this.mapWorkflowRun(await this.requestJson(`${apiBase}/actions/runs/${id}`, 'GitHub workflow run'));
  }

  async listWorkflowJobs(repoRef, runId) {
    const id = numericId(runId, 'workflow run'); const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/actions/runs/${id}/jobs?per_page=20`, 'GitHub workflow jobs');
    return (data.jobs || []).map(job => this.mapWorkflowJob(job));
  }

  async getWorkflowJob(repoRef, jobId) {
    const id = numericId(jobId, 'workflow job'); const { apiBase } = await this.getRepositoryContext(repoRef);
    return this.mapWorkflowJob(await this.requestJson(`${apiBase}/actions/jobs/${id}`, 'GitHub workflow job'));
  }

  async getWorkflowJobLog(repoRef, jobId, { maxChars = 12000 } = {}) {
    const id = numericId(jobId, 'workflow job'); const { apiBase } = await this.getRepositoryContext(repoRef);
    return this.requestText(`${apiBase}/actions/jobs/${id}/logs`, 'GitHub workflow job log', { maxChars });
  }

  async listWorkflowArtifacts(repoRef, runId, { perPage = 20, page = 1 } = {}) {
    const id = numericId(runId, 'workflow run'); const count = clampPerPage(perPage, 20); const pageNumber = clampPage(page);
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/actions/runs/${id}/artifacts?per_page=${count}&page=${pageNumber}`, 'GitHub workflow artifacts');
    return (data.artifacts || []).map(artifact => ({
      id: artifact.id, name: artifact.name || 'Artifact', size: artifact.size_in_bytes ?? 0, expired: !!artifact.expired,
      createdAt: artifact.created_at || '', expiresAt: artifact.expires_at || '', downloadUrl: artifact.archive_download_url || ''
    }));
  }

  async listBranches(repoRef, { perPage = 20, page = 1 } = {}) {
    const count = clampPerPage(perPage, 20); const pageNumber = clampPage(page); const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/branches?per_page=${count}&page=${pageNumber}`, 'GitHub branches');
    return data.map(branch => ({ name: branch.name || '', sha: branch.commit?.sha || '', protected: !!branch.protected }));
  }

  async compareWithDefault(repoRef, headSha) {
    const head = fullSha(headSha); const { raw, apiBase } = await this.getRepositoryContext(repoRef); const base = raw.default_branch || 'main';
    const data = await this.requestJson(`${apiBase}/compare/${encodeURIComponent(base)}...${head}`, 'GitHub compare');
    return {
      base, head, status: data.status || '', aheadBy: data.ahead_by ?? 0, behindBy: data.behind_by ?? 0,
      totalCommits: data.total_commits ?? 0, baseSha: data.base_commit?.sha || '', mergeBaseSha: data.merge_base_commit?.sha || '',
      files: (data.files || []).slice(0, 20).map(file => this.mapPullRequestFile(file))
    };
  }

  async listIssues(repoRef, { perPage = 10, page = 1 } = {}) {
    const count = clampPerPage(perPage, 10); const pageNumber = clampPage(page); const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/issues?state=all&per_page=${count}&page=${pageNumber}`, 'GitHub issues');
    return data.filter(issue => !issue.pull_request).map(issue => ({
      number: issue.number, title: issue.title || '', state: issue.state || '', author: issue.user?.login || 'unknown', comments: issue.comments ?? 0, url: issue.html_url || ''
    }));
  }

  async listReleases(repoRef, { perPage = 10, page = 1 } = {}) {
    const count = clampPerPage(perPage, 10); const pageNumber = clampPage(page); const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(`${apiBase}/releases?per_page=${count}&page=${pageNumber}`, 'GitHub releases');
    return data.map(release => ({
      id: release.id, tag: release.tag_name || '', name: release.name || release.tag_name || 'Release', draft: !!release.draft,
      prerelease: !!release.prerelease, publishedAt: release.published_at || release.created_at || '', url: release.html_url || ''
    }));
  }

  async rerunFailedWorkflowRun(repoRef, runId) {
    const id = numericId(runId, 'workflow run'); const { apiBase } = await this.getRepositoryContext(repoRef);
    return this.requestJson(`${apiBase}/actions/runs/${id}/rerun-failed-jobs`, 'GitHub rerun failed jobs', { method: 'POST', allowEmpty: true });
  }

  async cancelWorkflowRun(repoRef, runId) {
    const id = numericId(runId, 'workflow run'); const { apiBase } = await this.getRepositoryContext(repoRef);
    return this.requestJson(`${apiBase}/actions/runs/${id}/cancel`, 'GitHub cancel workflow run', { method: 'POST', allowEmpty: true });
  }
}
