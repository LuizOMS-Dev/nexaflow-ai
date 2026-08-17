import { prisma } from "../../lib/prisma";
import { encryptSecret, decryptSecret } from "../security/crypto";

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
  isCached?: boolean;
};

export class GitHubClient {
  private customOwner?: string;
  private customRepo?: string;
  private customBranch?: string;
  private customToken?: string;
  private memCache: {
    timestamp: number;
    commits: GitHubCommitInfo[];
  } | null = null;

  constructor(opts?: { owner?: string; repo?: string; branch?: string; token?: string }) {
    this.customOwner = opts?.owner;
    this.customRepo = opts?.repo;
    this.customBranch = opts?.branch;
    this.customToken = opts?.token;
  }

  async getEffectiveConfig(): Promise<{
    owner: string;
    repo: string;
    branch: string;
    token?: string;
  }> {
    try {
      const setting = await prisma.platformSetting.findUnique({
        where: { key: "github_config" },
      });
      if (setting?.value && typeof setting.value === "object") {
        const v = setting.value as any;
        const decryptedToken = v.encryptedToken
          ? decryptSecret(v.encryptedToken).plain
          : undefined;
        return {
          owner: v.owner || process.env.GITHUB_REPO_OWNER || "LuizOMS-Dev",
          repo: v.repo || process.env.GITHUB_REPO_NAME || "nexaflow-ai",
          branch: v.branch || process.env.GITHUB_BRANCH || "main",
          token: decryptedToken || process.env.GITHUB_TOKEN,
        };
      }
    } catch {}

    return {
      owner: this.customOwner || process.env.GITHUB_REPO_OWNER || "LuizOMS-Dev",
      repo: this.customRepo || process.env.GITHUB_REPO_NAME || "nexaflow-ai",
      branch: this.customBranch || process.env.GITHUB_BRANCH || "main",
      token: this.customToken || process.env.GITHUB_TOKEN,
    };
  }

  async getRepoInfo() {
    const cfg = await this.getEffectiveConfig();
    return {
      owner: cfg.owner,
      repo: cfg.repo,
      branch: cfg.branch,
      fullName: `${cfg.owner}/${cfg.repo}`,
    };
  }

  async getHistoryClearedMarker(): Promise<{
    clearedAt: string | null;
    lastClearedSha: string | null;
  }> {
    try {
      const setting = await prisma.platformSetting.findUnique({
        where: { key: "github_history_cleared_at" },
      });
      if (setting?.value && typeof setting.value === "object") {
        const v = setting.value as any;
        return {
          clearedAt: v.clearedAt || null,
          lastClearedSha: v.lastClearedSha || null,
        };
      }
    } catch {}

    return { clearedAt: null, lastClearedSha: null };
  }

  async clearVisualHistory(userId: string, email?: string): Promise<{
    clearedAt: string;
    hiddenCount: number;
    lastClearedSha?: string;
  }> {
    let currentCommits: GitHubCommitInfo[] = [];
    try {
      currentCommits = await this.listRecentCommitsRaw(30, false);
    } catch {}

    const nowIso = new Date().toISOString();
    const lastClearedSha = currentCommits[0]?.sha;

    await prisma.platformSetting.upsert({
      where: { key: "github_history_cleared_at" },
      create: {
        key: "github_history_cleared_at",
        value: {
          clearedAt: nowIso,
          clearedById: userId,
          clearedByEmail: email,
          lastClearedSha,
          hiddenCount: currentCommits.length,
          updatedAt: nowIso,
        },
      },
      update: {
        value: {
          clearedAt: nowIso,
          clearedById: userId,
          clearedByEmail: email,
          lastClearedSha,
          hiddenCount: currentCommits.length,
          updatedAt: nowIso,
        },
      },
    });

    return {
      clearedAt: nowIso,
      hiddenCount: currentCommits.length,
      lastClearedSha,
    };
  }

  /**
   * Tenta obter commits do repositório local git se disponível
   */
  private async getLocalGitCommits(limit = 20): Promise<GitHubCommitInfo[]> {
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);

      const { stdout } = await execFileAsync("git", [
        "log",
        `-n`,
        String(limit),
        `--pretty=format:%H|%h|%an|%aI|%s`,
      ]);

      const lines = stdout.trim().split("\n").filter(Boolean);
      return lines.map((line) => {
        const [sha, shortSha, author, date, ...msgParts] = line.split("|");
        const message = msgParts.join("|");
        return {
          sha: sha?.trim() || "",
          shortSha: shortSha?.trim() || (sha ? sha.slice(0, 7) : ""),
          message: message?.trim() || "Sem mensagem",
          author: author?.trim() || "Desconhecido",
          date: date?.trim() || new Date().toISOString(),
          url: `https://github.com/LuizOMS-Dev/nexaflow-ai/commit/${sha?.trim()}`,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Obtém os commits persistidos em cache no banco
   */
  private async getPersistentCache(): Promise<GitHubCommitInfo[]> {
    try {
      const setting = await prisma.platformSetting.findUnique({
        where: { key: "github_commits_cache" },
      });
      if (setting?.value && typeof setting.value === "object") {
        const v = setting.value as any;
        if (Array.isArray(v.commits) && v.commits.length > 0) {
          return v.commits;
        }
      }
    } catch {}
    return [];
  }

  /**
   * Salva os commits em cache persistente no banco e memória
   */
  private async savePersistentCache(commits: GitHubCommitInfo[]) {
    this.memCache = {
      timestamp: Date.now(),
      commits,
    };

    try {
      await prisma.platformSetting.upsert({
        where: { key: "github_commits_cache" },
        create: {
          key: "github_commits_cache",
          value: {
            updatedAt: new Date().toISOString(),
            count: commits.length,
            commits,
          },
        },
        update: {
          value: {
            updatedAt: new Date().toISOString(),
            count: commits.length,
            commits,
          },
        },
      });
    } catch {}
  }

  /**
   * Consulta a lista de commits reais diretamente no GitHub com fallback para cache e git local
   */
  async listRecentCommitsRaw(limit = 20, forceRefresh = false): Promise<GitHubCommitInfo[]> {
    const now = Date.now();
    // Cache em memória de 30s se não for forçado
    if (!forceRefresh && this.memCache && now - this.memCache.timestamp < 30_000 && this.memCache.commits.length > 0) {
      return this.memCache.commits.slice(0, limit);
    }

    const cfg = await this.getEffectiveConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits?sha=${cfg.branch}&per_page=${Math.max(limit, 15)}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexaFlow-Deploy-Client/1.0",
    };

    if (cfg.token) {
      headers.Authorization = `Bearer ${cfg.token}`;
    }

    try {
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

      const mapped: GitHubCommitInfo[] = data.map((d) => {
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

      if (mapped.length > 0) {
        await this.savePersistentCache(mapped);
      }

      return mapped.slice(0, limit);
    } catch (err) {
      // Fallback 1: cache persistente no banco
      const cached = await this.getPersistentCache();
      if (cached.length > 0) {
        return cached.slice(0, limit);
      }

      // Fallback 2: git log local
      const local = await this.getLocalGitCommits(limit);
      if (local.length > 0) {
        await this.savePersistentCache(local);
        return local.slice(0, limit);
      }

      throw err;
    }
  }

  /**
   * Consulta o commit mais recente da branch principal
   */
  async getLatestCommit(forceRefresh = false): Promise<GitHubCommitInfo> {
    const cfg = await this.getEffectiveConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits/${cfg.branch}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexaFlow-Deploy-Client/1.0",
    };

    if (cfg.token) {
      headers.Authorization = `Bearer ${cfg.token}`;
    }

    try {
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
    } catch (err) {
      // Fallback: busca do rawCommits / cache persistente / git local
      const raw = await this.listRecentCommitsRaw(1, forceRefresh).catch(() => []);
      if (raw.length > 0 && raw[0]) {
        return raw[0];
      }
      throw err;
    }
  }

  /**
   * Lista os commits recentes para exibição visual (aplica filtro do clear marker se houver)
   */
  async listRecentCommits(limit = 10, forceRefresh = false): Promise<GitHubCommitInfo[]> {
    const rawCommits = await this.listRecentCommitsRaw(Math.max(limit, 20), forceRefresh);
    const marker = await this.getHistoryClearedMarker();

    if (!marker.clearedAt) {
      return rawCommits.slice(0, limit);
    }

    const clearedTime = new Date(marker.clearedAt).getTime();

    const filtered = rawCommits.filter((c) => {
      const commitTime = new Date(c.date).getTime();
      if (marker.lastClearedSha && c.sha === marker.lastClearedSha) return false;
      return commitTime > clearedTime;
    });

    return filtered.slice(0, limit);
  }

  /**
   * Status de conexão do repositório
   */
  async getRepoStatus(): Promise<GitHubRepoStatus> {
    const cfg = await this.getEffectiveConfig();
    try {
      const latest = await this.getLatestCommit(false);
      return {
        connected: true,
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        latestCommit: latest,
      };
    } catch (e) {
      // Tenta recuperar do cache persistente ou git local
      const cached = await this.listRecentCommitsRaw(1, false).catch(() => []);
      if (cached.length > 0 && cached[0]) {
        return {
          connected: true,
          owner: cfg.owner,
          repo: cfg.repo,
          branch: cfg.branch,
          latestCommit: cached[0],
          isCached: true,
        };
      }

      return {
        connected: false,
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        latestCommit: null,
        error: e instanceof Error ? e.message : "Não foi possível conectar ao GitHub",
      };
    }
  }
}

export const githubClient = new GitHubClient();
