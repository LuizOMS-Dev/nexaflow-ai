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
  private customOwner?: string;
  private customRepo?: string;
  private customBranch?: string;
  private customToken?: string;

  constructor(opts?: { owner?: string; repo?: string; branch?: string; token?: string }) {
    this.customOwner = opts?.owner;
    this.customRepo = opts?.repo;
    this.customBranch = opts?.branch;
    this.customToken = opts?.token;
  }

  get owner(): string {
    return this.customOwner || process.env.GITHUB_REPO_OWNER || "LuizOMS-Dev";
  }

  get repo(): string {
    return this.customRepo || process.env.GITHUB_REPO_NAME || "nexaflow-ai";
  }

  get branch(): string {
    return this.customBranch || process.env.GITHUB_BRANCH || "main";
  }

  get token(): string | undefined {
    return this.customToken || process.env.GITHUB_TOKEN;
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
      commit?: {
        message?: string;
        author?: { name?: string; date?: string };
      };
      html_url?: string;
    };

    const fullSha = (data.sha || "").trim();
    return {
      sha: fullSha,
      shortSha: fullSha.slice(0, 7),
      message: (data.commit?.message || "Sem mensagem").split("\n")[0].trim(),
      author: data.commit?.author?.name || "Desconhecido",
      date: data.commit?.author?.date || new Date().toISOString(),
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
      commit?: {
        message?: string;
        author?: { name?: string; date?: string };
      };
      html_url?: string;
    }>;

    return data.map((d) => {
      const fullSha = (d.sha || "").trim();
      return {
        sha: fullSha,
        shortSha: fullSha.slice(0, 7),
        message: (d.commit?.message || "Sem mensagem").split("\n")[0].trim(),
        author: d.commit?.author?.name || "Desconhecido",
        date: d.commit?.author?.date || new Date().toISOString(),
        url: d.html_url,
      };
    });
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
