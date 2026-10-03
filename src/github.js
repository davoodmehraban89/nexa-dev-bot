import { DEFAULT_CONFIG } from './config.js';

export class GitHubService {
  constructor(token = '', owner = DEFAULT_CONFIG.defaultOwner) {
    this.token = token;
    this.owner = owner;
    this.baseUrl = 'https://api.github.com';
  }

  requireToken() {
    if (!this.token) {
      throw new Error('GITHUB_TOKEN is not configured');
    }
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
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const providerMessage = parsed?.message || raw.slice(0, 240);
      const detail = providerMessage ? ` ${providerMessage}` : '';
      throw new Error(`${label} failed: ${res.status}${detail}`);
    }

    if (allowEmpty) {
      return { accepted: true, status: res.status };
    }

    if (!raw) return null;
    if (parsed === null) {
      throw new Error(`${label} failed: invalid JSON response`);
    }
    return parsed;
  }

  repoUrl(repo, suffix = '') {
    return `${this.baseUrl}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(repo)}${suffix}`;
  }

  repositoryLookupUrl(repoRef) {
    const value = String(repoRef || '');
    if (/^\d+$/.test(value)) {
      return `${this.baseUrl}/repositories/${value}`;
    }
    return this.repoUrl(value);
  }

  repositoryApiBase(fullName) {
    const parts = String(fullName || '').split('/').filter(Boolean);
    if (parts.length !== 2) {
      throw new Error('GitHub repository full_name is invalid');
    }
    return `${this.baseUrl}/repos/${parts.map(encodeURIComponent).join('/')}`;
  }

  async getRepositoryContext(repoRef) {
    const raw = await this.requestJson(this.repositoryLookupUrl(repoRef), 'GitHub repository');
    return {
      raw,
      apiBase: this.repositoryApiBase(raw.full_name)
    };
  }

  mapRepository(r) {
    return {
      id: String(r.id ?? r.name),
      name: r.name,
      fullName: r.full_name,
      private: !!r.private,
      description: r.description || '',
      defaultBranch: r.default_branch || 'main',
      archived: !!r.archived,
      htmlUrl: r.html_url || '',
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0
    };
  }

  mapWorkflowRun(run = {}) {
    return {
      id: run.id,
      name: run.name || 'Workflow',
      status: run.status || '',
      conclusion: run.conclusion || null,
      event: run.event || '',
      branch: run.head_branch || '',
      sha: String(run.head_sha || '').slice(0, 7),
      runNumber: run.run_number ?? null,
      url: run.html_url || '',
      createdAt: run.created_at || '',
      updatedAt: run.updated_at || ''
    };
  }

  mapWorkflowJob(job = {}) {
    return {
      id: job.id,
      name: job.name || 'Job',
      status: job.status || '',
      conclusion: job.conclusion || null,
      startedAt: job.started_at || '',
      completedAt: job.completed_at || '',
      url: job.html_url || '',
      steps: (job.steps || []).slice(0, 30).map(step => ({
        number: step.number,
        name: step.name || 'Step',
        status: step.status || '',
        conclusion: step.conclusion || null
      }))
    };
  }

  async listRepositories() {
    const data = await this.requestJson(
      `${this.baseUrl}/user/repos?sort=updated&per_page=20&affiliation=owner,collaborator,organization_member`,
      'GitHub repositories'
    );

    return data.map(r => {
      const repo = this.mapRepository(r);
      return {
        ...repo,
        title: `${repo.name} ${repo.private ? '🔒' : '🌐'}`
      };
    });
  }

  async getRepository(repoRef) {
    const { raw } = await this.getRepositoryContext(repoRef);
    return this.mapRepository(raw);
  }

  async listPullRequests(repoRef) {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(
      `${apiBase}/pulls?state=all&per_page=10`,
      'GitHub pull requests'
    );

    return data.map(pr => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || 'unknown',
      state: pr.state,
      merged: !!pr.merged_at,
      createdAt: pr.created_at,
      url: pr.html_url
    }));
  }

  async listCommits(repoRef) {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(
      `${apiBase}/commits?per_page=5`,
      'GitHub commits'
    );

    return data.map(c => ({
      sha: c.sha.slice(0, 7),
      message: String(c.commit?.message || '').split('\n')[0],
      author: c.author?.login || c.commit?.author?.name || 'Unknown',
      date: c.commit?.author?.date ? c.commit.author.date.slice(0, 10) : ''
    }));
  }

  async listFiles(repoRef, path = '') {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const suffix = path
      ? `/contents/${path.split('/').map(encodeURIComponent).join('/')}`
      : '/contents';
    const data = await this.requestJson(`${apiBase}${suffix}`, 'GitHub contents');

    if (!Array.isArray(data)) {
      throw new Error('GitHub contents response is not a directory listing');
    }

    return data.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size ?? 0,
      sha: item.sha || ''
    }));
  }

  async listTree(repoRef, sha) {
    if (!/^[a-f0-9]{40}$/i.test(String(sha || ''))) {
      throw new Error('Invalid Git tree SHA');
    }

    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(
      `${apiBase}/git/trees/${encodeURIComponent(sha)}`,
      'GitHub tree'
    );

    return (data.tree || [])
      .filter(item => item.type === 'tree' || item.type === 'blob')
      .map(item => ({
        name: item.path,
        path: item.path,
        type: item.type === 'tree' ? 'dir' : 'file',
        size: item.size ?? 0,
        sha: item.sha || ''
      }));
  }

  async getBlob(repoRef, sha) {
    if (!/^[a-f0-9]{40}$/i.test(String(sha || ''))) {
      throw new Error('Invalid Git blob SHA');
    }

    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(
      `${apiBase}/git/blobs/${encodeURIComponent(sha)}`,
      'GitHub blob'
    );

    return {
      encoding: data.encoding || '',
      size: data.size ?? 0,
      content: data.content || ''
    };
  }

  async getRepoStatus(repoRef) {
    const { raw, apiBase } = await this.getRepositoryContext(repoRef);
    const runsData = await this.requestJson(
      `${apiBase}/actions/runs?per_page=3`,
      'GitHub Actions runs'
    );

    const runs = runsData.workflow_runs || [];
    return {
      repo: String(repoRef),
      repoName: raw.name,
      defaultBranch: raw.default_branch || 'main',
      lastRuns: runs.map(r => ({
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        commit: r.head_commit?.message?.slice(0, 80) || '',
        url: r.html_url || ''
      }))
    };
  }

  async listWorkflowRuns(repoRef, { perPage = 10, page = 1 } = {}) {
    const count = Math.max(1, Math.min(20, Number(perPage) || 10));
    const pageNumber = Math.max(1, Math.min(100, Number(page) || 1));
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(
      `${apiBase}/actions/runs?per_page=${count}&page=${pageNumber}`,
      'GitHub workflow runs'
    );
    return (data.workflow_runs || []).map(run => this.mapWorkflowRun(run));
  }

  async getWorkflowRun(repoRef, runId) {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(
      `${apiBase}/actions/runs/${encodeURIComponent(String(runId))}`,
      'GitHub workflow run'
    );
    return this.mapWorkflowRun(data);
  }

  async listWorkflowJobs(repoRef, runId) {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    const data = await this.requestJson(
      `${apiBase}/actions/runs/${encodeURIComponent(String(runId))}/jobs?per_page=20`,
      'GitHub workflow jobs'
    );
    return (data.jobs || []).map(job => this.mapWorkflowJob(job));
  }

  async rerunFailedWorkflowRun(repoRef, runId) {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    return this.requestJson(
      `${apiBase}/actions/runs/${encodeURIComponent(String(runId))}/rerun-failed-jobs`,
      'GitHub rerun failed jobs',
      { method: 'POST', allowEmpty: true }
    );
  }

  async cancelWorkflowRun(repoRef, runId) {
    const { apiBase } = await this.getRepositoryContext(repoRef);
    return this.requestJson(
      `${apiBase}/actions/runs/${encodeURIComponent(String(runId))}/cancel`,
      'GitHub cancel workflow run',
      { method: 'POST', allowEmpty: true }
    );
  }
}
