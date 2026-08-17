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
    // 1. Obtém os commits atuais para marcar o SHA mais recente
    let currentCommits: GitHubCommitInfo[] = [];
    try {
      currentCommits = await this.listRecentCommitsRaw(30);
    } catch {}

    const nowIso = new Date().toISOString();
    const lastClearedSha = currentCommits[0]?.sha;

    // 2. Persiste o marcador administrativo
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

  async getLatestCommit(): Promise<GitHubCommitInfo> {
    const cfg = await this.getEffectiveConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits/${cfg.branch}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexaFlow-Deploy-Client/1.0",
    };

    if (cfg.token) {
      headers.Authorization = `Bearer ${cfg.token}`;
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

  private async listRecentCommitsRaw(limit = 20): Promise<GitHubCommitInfo[]> {
    const cfg = await this.getEffectiveConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits?sha=${cfg.branch}&per_page=${limit}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexaFlow-Deploy-Client/1.0",
    };

    if (cfg.token) {
      headers.Authorization = `Bearer ${cfg.token}`;
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
        author: data ? d.commit?.author?.name || "Desconhecido" : "Desconhecido",
        date: d.commit?.author?.date || new Date().toISOString(),
        url: d.html_url,
      };
    });
  }

  async listRecentCommits(limit = 10): Promise<GitHubCommitInfo[]> {
    const rawCommits = await this.listRecentCommitsRaw(Math.max(limit, 20));
    const marker = await this.getHistoryClearedMarker();

    if (!marker.clearedAt) {
      return rawCommits.slice(0, limit);
    }

    const clearedTime = new Date(marker.clearedAt).getTime();

    // Filtra commits criados estritamente APÓS a data da limpeza
    const filtered = rawCommits.filter((c) => {
      const commitTime = new Date(c.date).getTime();
      // Se for anterior ou igual ao momento da limpeza, ou tiver o mesmo SHA marcado, oculta do histórico visual
      if (marker.lastClearedSha && c.sha === marker.lastClearedSha) return false;
      return commitTime > clearedTime;
    });

    return filtered.slice(0, limit);
  }

  async getRepoStatus(): Promise<GitHubRepoStatus> {
    const cfg = await this.getEffectiveConfig();
    try {
      const latest = await this.getLatestCommit();
      return {
        connected: true,
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        latestCommit: latest,
      };
    } catch (e) {
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
