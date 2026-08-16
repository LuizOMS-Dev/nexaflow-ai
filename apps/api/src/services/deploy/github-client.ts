export type GitHubCommitInfo = {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url?: string;
};

export type GitHubRepoStatus = {
  connected: boolean;
  owner: string;
  repo: string;
  branch: string;
  latestCommit: GitHubCommitInfo | null;
  error?: string;
};

export class GitHubClient {
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly token?: string;

  constructor(opts?: { owner?: string; repo?: string; branch?: string; token?: string }) {
    this.owner = opts?.owner || process.env.GITHUB_REPO_OWNER || "LuizOMS-Dev";
    this.repo = opts?.repo || process.env.GITHUB_REPO_NAME || "nexaflow-ai";
    this.branch = opts?.branch || process.env.GITHUB_BRANCH || "main";
    this.token = opts?.token || process.env.GITHUB_TOKEN;
  }

  getRepoInfo() {
    return {
      owner: this.owner,
      repo: this.repo,
      branch: this.branch,
      fullName: `${this.owner}/${this.repo}`,
    };
  }

  async getLatestCommit(): Promise<GitHubCommitInfo> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/commits/${this.branch}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexaFlow-Deploy-Client/1.0",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`GitHub API retornou status ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      sha: string;
      commit: {
        message: string;
        author: { name: string; date: string };
      };
      html_url?: string;
    };

    return {
      sha: data.sha,
      shortSha: data.sha.slice(0, 7),
      message: (data.commit.message || "").split("\n")[0].trim(),
      author: data.commit.author?.name || "Desconhecido",
      date: data.commit.author?.date || new Date().toISOString(),
      url: data.html_url,
    };
  }

  async listRecentCommits(limit = 10): Promise<GitHubCommitInfo[]> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/commits?sha=${this.branch}&per_page=${limit}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexaFlow-Deploy-Client/1.0",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`GitHub API retornou status ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as Array<{
      sha: string;
      commit: {
        message: string;
        author: { name: string; date: string };
      };
      html_url?: string;
    }>;

    return data.map((d) => ({
      sha: d.sha,
      shortSha: d.sha.slice(0, 7),
      message: (d.commit.message || "").split("\n")[0].trim(),
      author: d.commit.author?.name || "Desconhecido",
      date: d.commit.author?.date || new Date().toISOString(),
      url: d.html_url,
    }));
  }

  async getRepoStatus(): Promise<GitHubRepoStatus> {
    try {
      const latest = await this.getLatestCommit();
      return {
        connected: true,
        owner: this.owner,
        repo: this.repo,
        branch: this.branch,
        latestCommit: latest,
      };
    } catch (e) {
      return {
        connected: false,
        owner: this.owner,
        repo: this.repo,
        branch: this.branch,
        latestCommit: null,
        error: e instanceof Error ? e.message : "Não foi possível conectar ao GitHub",
      };
    }
  }
}

export const githubClient = new GitHubClient();
