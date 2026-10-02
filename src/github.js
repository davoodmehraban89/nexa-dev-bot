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

  async requestJson(url, label) {
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.message ? ` ${body.message}` : '';
      } catch {
        detail = '';
      }
      throw new Error(`${label} failed: ${res.status}${detail}`);
    }
    return res.json();
  }

  repoUrl(repo, suffix = '') {
    return `${this.baseUrl}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(repo)}${suffix}`;
  }

  async listRepositories() {
    const data = await this.requestJson(
      `${this.baseUrl}/user/repos?sort=updated&per_page=20&affiliation=owner,collaborator,organization_member`,
      'GitHub repositories'
    );

    return data.map(r => ({
      id: r.name,
      name: r.name,
      fullName: r.full_name,
      title: `${r.name} ${r.private ? '🔒' : '🌐'}`,
      private: !!r.private,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      description: r.description || '',
      defaultBranch: r.default_branch || 'main'
    }));
  }

  async getRepository(repo) {
    const r = await this.requestJson(this.repoUrl(repo), 'GitHub repository');
    return {
      id: r.name,
      name: r.name,
      fullName: r.full_name,
      private: !!r.private,
      description: r.description || '',
      defaultBranch: r.default_branch || 'main',
      archived: !!r.archived,
      htmlUrl: r.html_url || ''
    };
  }

  async listPullRequests(repo) {
    const data = await this.requestJson(
      this.repoUrl(repo, '/pulls?state=all&per_page=10'),
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

  async listCommits(repo) {
    const data = await this.requestJson(
      this.repoUrl(repo, '/commits?per_page=5'),
      'GitHub commits'
    );

    return data.map(c => ({
      sha: c.sha.slice(0, 7),
      message: String(c.commit?.message || '').split('\n')[0],
      author: c.author?.login || c.commit?.author?.name || 'Unknown',
      date: c.commit?.author?.date ? c.commit.author.date.slice(0, 10) : ''
    }));
  }

  async listFiles(repo, path = '') {
    const suffix = path
      ? `/contents/${path.split('/').map(encodeURIComponent).join('/')}`
      : '/contents';
    const data = await this.requestJson(this.repoUrl(repo, suffix), 'GitHub contents');

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

  async getRepoStatus(repo) {
    const [repository, runsData] = await Promise.all([
      this.getRepository(repo),
      this.requestJson(this.repoUrl(repo, '/actions/runs?per_page=3'), 'GitHub Actions runs')
    ]);

    const runs = runsData.workflow_runs || [];
    return {
      repo,
      defaultBranch: repository.defaultBranch,
      lastRuns: runs.map(r => ({
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        commit: r.head_commit?.message?.slice(0, 80) || '',
        url: r.html_url || ''
      }))
    };
  }
}
