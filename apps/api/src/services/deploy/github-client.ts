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

export type GitHubRateLimitInfo = {
  limit: number;
  remaining: number;
  resetAt: string | null; // ISO string
  resetEpochMs: number | null;
  isRateLimited: boolean;
  retryAfterSeconds?: number;
};

export type GitHubRepoStatus = {
  connected: boolean;
  owner: string;
  repo: string;
  branch: string;
  latestCommit: GitHubCommitInfo | null;
  tokenConfigured: boolean;
  rateLimit?: GitHubRateLimitInfo;
  isCached?: boolean;
  error?: string;
};

export type TestGitHubConnectionResult = {
  success: boolean;
  message: string;
  state: "CONNECTED" | "NOT_CONFIGURED" | "AUTH_FAILED" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE";
  details?: {
    authenticated: boolean;
    repoFound: boolean;
    branchFound: boolean;
  };
  rateLimit?: GitHubRateLimitInfo;
  latestCommit?: GitHubCommitInfo;
};

export class GitHubClient {
  private customOwner?: string;
  private customRepo?: string;
  private customBranch?: string;
  private customToken?: string;

  // In-flight request deduplication map
  private inFlightRequests = new Map<string, Promise<any>>();

  // Rate limit tracking state
  private rateLimitState: GitHubRateLimitInfo = {
    limit: 60,
    remaining: 60,
    resetAt: null,
    resetEpochMs: null,
    isRateLimited: false,
  };

  // In-memory cache with TTL
  private latestCommitCache: { key: string; data: GitHubCommitInfo; timestamp: number } | null = null;
  private recentCommitsCache: { key: string; data: GitHubCommitInfo[]; timestamp: number } | null = null;
  private repoStatusCache: { key: string; data: GitHubRepoStatus; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60_000; // 60 segundos

  constructor(opts?: { owner?: string; repo?: string; branch?: string; token?: string }) {
    this.customOwner = opts?.owner;
    this.customRepo = opts?.repo;
    this.customBranch = opts?.branch;
    this.customToken = opts?.token;
  }

  /**
   * Deduplica requisições concorrentes idênticas em voo
   */
  private async deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlightRequests.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  /**
   * Atualiza o estado interno de rate limit a partir dos headers da resposta do GitHub
   */
  private updateRateLimitFromHeaders(headers: Headers) {
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    const retryAfter = headers.get("retry-after");

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        this.rateLimitState.limit = parsedLimit;
      }
    }

    if (remaining !== null && remaining !== undefined) {
      const rem = parseInt(remaining, 10);
      if (!isNaN(rem)) {
        this.rateLimitState.remaining = rem;
      }
    }

    let resetEpochMs: number | null = null;
    if (reset) {
      const resetSec = parseInt(reset, 10);
      if (!isNaN(resetSec) && resetSec > 0) {
        resetEpochMs = resetSec * 1000;
      }
    }

    if (retryAfter) {
      const retrySec = parseInt(retryAfter, 10);
      if (!isNaN(retrySec) && retrySec > 0) {
        this.rateLimitState.retryAfterSeconds = retrySec;
        resetEpochMs = Date.now() + retrySec * 1000;
      }
    }

    if (resetEpochMs) {
      this.rateLimitState.resetEpochMs = resetEpochMs;
      this.rateLimitState.resetAt = new Date(resetEpochMs).toISOString();
    }

    if (this.rateLimitState.remaining === 0) {
      this.rateLimitState.isRateLimited = true;
      if (!this.rateLimitState.resetEpochMs) {
        this.rateLimitState.resetEpochMs = Date.now() + 60_000;
        this.rateLimitState.resetAt = new Date(this.rateLimitState.resetEpochMs).toISOString();
      }
    } else if (this.rateLimitState.resetEpochMs && Date.now() >= this.rateLimitState.resetEpochMs) {
      this.rateLimitState.isRateLimited = false;
    }
  }

  /**
   * Verifica se o cliente está atualmente bloqueado por rate limit
   */
  public isRateLimited(): boolean {
    if (!this.rateLimitState.isRateLimited) return false;
    if (this.rateLimitState.resetEpochMs && Date.now() >= this.rateLimitState.resetEpochMs) {
      this.rateLimitState.isRateLimited = false;
      this.rateLimitState.resetAt = null;
      this.rateLimitState.resetEpochMs = null;
      return false;
    }
    return true;
  }

  /**
   * Retorna os metadados de rate limit não sensíveis para o frontend
   */
  public getRateLimitInfo(): GitHubRateLimitInfo {
    const isLimited = this.isRateLimited();
    return {
      limit: this.rateLimitState.limit,
      remaining: this.rateLimitState.remaining,
      resetAt: this.rateLimitState.resetAt,
      resetEpochMs: this.rateLimitState.resetEpochMs,
      isRateLimited: isLimited,
      retryAfterSeconds: this.rateLimitState.retryAfterSeconds,
    };
  }

  /**
   * Obtém a configuração efetiva server-side descriptografando o token (Write-Only)
   */
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

  /**
   * Retorna a configuração pública/sanitizada para o frontend (WRITE-ONLY: NUNCA expõe o token)
   */
  async getConfigSanitized(): Promise<{
    configured: boolean;
    owner: string;
    repo: string;
    branch: string;
    tokenConfigured: boolean;
    rateLimit: GitHubRateLimitInfo;
  }> {
    const cfg = await this.getEffectiveConfig();
    return {
      configured: Boolean(cfg.owner && cfg.repo),
      owner: cfg.owner,
      repo: cfg.repo,
      branch: cfg.branch,
      tokenConfigured: Boolean(cfg.token),
      rateLimit: this.getRateLimitInfo(),
    };
  }

  /**
   * Salva a configuração do GitHub criptografando o token em repouso (AES-256-GCM)
   */
  async saveConfig(input: {
    owner?: string;
    repo?: string;
    branch?: string;
    token?: string;
  }): Promise<{ success: boolean }> {
    const owner = (input.owner || "").trim() || "LuizOMS-Dev";
    const repo = (input.repo || "").trim() || "nexaflow-ai";
    const branch = (input.branch || "").trim() || "main";
    let token = (input.token || "").trim();

    if (!token) {
      const current = await this.getEffectiveConfig();
      token = current.token || "";
    }

    const encryptedToken = token ? encryptSecret(token) : null;
    const nowIso = new Date().toISOString();

    await prisma.platformSetting.upsert({
      where: { key: "github_config" },
      create: {
        key: "github_config",
        value: {
          owner,
          repo,
          branch,
          encryptedToken,
          updatedAt: nowIso,
        },
      },
      update: {
        value: {
          owner,
          repo,
          branch,
          encryptedToken,
          updatedAt: nowIso,
        },
      },
    });

    // Invalida os caches em memória
    this.latestCommitCache = null;
    this.recentCommitsCache = null;
    this.repoStatusCache = null;

    return { success: true };
  }

  /**
   * Testa a conexão e credenciais do GitHub de forma granular sem alterar a configuração persistida
   */
  async testConnection(input?: {
    owner?: string;
    repo?: string;
    branch?: string;
    token?: string;
  }): Promise<TestGitHubConnectionResult> {
    const effective = await this.getEffectiveConfig();
    const owner = input?.owner?.trim() || effective.owner;
    const repo = input?.repo?.trim() || effective.repo;
    const branch = input?.branch?.trim() || effective.branch;
    const token = input?.token?.trim() || effective.token;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexaFlow-Deploy-Client/1.0",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // 1. Testa acesso ao repositório
    const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    try {
      const resRepo = await fetch(repoUrl, { headers, signal: AbortSignal.timeout(10000) });
      this.updateRateLimitFromHeaders(resRepo.headers);

      if (resRepo.status === 401) {
        return {
          success: false,
          state: "AUTH_FAILED",
          message: "Credencial do GitHub inválida ou token expirado.",
          details: { authenticated: false, repoFound: false, branchFound: false },
          rateLimit: this.getRateLimitInfo(),
        };
      }

      if (resRepo.status === 403 || resRepo.status === 429) {
        const bodyText = await resRepo.text().catch(() => "");
        const isRate = /rate limit|secondary rate/i.test(bodyText);
        return {
          success: false,
          state: isRate ? "RATE_LIMITED" : "AUTH_FAILED",
          message: isRate
            ? "Limite de requisições do GitHub atingido temporariamente."
            : "Acesso não autorizado ao repositório.",
          details: { authenticated: Boolean(token), repoFound: false, branchFound: false },
          rateLimit: this.getRateLimitInfo(),
        };
      }

      if (resRepo.status === 404) {
        return {
          success: false,
          state: "NOT_FOUND",
          message: `Repositório '${owner}/${repo}' não encontrado ou sem permissão de acesso.`,
          details: { authenticated: Boolean(token), repoFound: false, branchFound: false },
          rateLimit: this.getRateLimitInfo(),
        };
      }

      if (!resRepo.ok) {
        return {
          success: false,
          state: "UNAVAILABLE",
          message: `GitHub retornou status ${resRepo.status}.`,
          details: { authenticated: Boolean(token), repoFound: false, branchFound: false },
          rateLimit: this.getRateLimitInfo(),
        };
      }

      // 2. Testa branch e obtém commit mais recente
      const branchUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
      const resBranch = await fetch(branchUrl, { headers, signal: AbortSignal.timeout(10000) });
      this.updateRateLimitFromHeaders(resBranch.headers);

      if (resBranch.status === 404) {
        return {
          success: false,
          state: "NOT_FOUND",
          message: `Branch '${branch}' não encontrada no repositório '${owner}/${repo}'.`,
          details: { authenticated: true, repoFound: true, branchFound: false },
          rateLimit: this.getRateLimitInfo(),
        };
      }

      if (!resBranch.ok) {
        return {
          success: false,
          state: "UNAVAILABLE",
          message: `Não foi possível acessar a branch '${branch}' no momento.`,
          details: { authenticated: true, repoFound: true, branchFound: false },
          rateLimit: this.getRateLimitInfo(),
        };
      }

      const branchData = (await resBranch.json()) as any;
      const fullSha = (branchData.sha || "").trim();
      const latestCommit: GitHubCommitInfo = {
        sha: fullSha,
        shortSha: fullSha.slice(0, 7),
        message: (branchData.commit?.message || "Sem mensagem").split("\n")[0].trim(),
        author: branchData.commit?.author?.name || "Desconhecido",
        date: branchData.commit?.author?.date || new Date().toISOString(),
        url: branchData.html_url,
      };

      return {
        success: true,
        state: "CONNECTED",
        message: "GitHub conectado com sucesso!",
        details: { authenticated: true, repoFound: true, branchFound: true },
        rateLimit: this.getRateLimitInfo(),
        latestCommit,
      };
    } catch (err: any) {
      return {
        success: false,
        state: "UNAVAILABLE",
        message: "Tempo limite ou falha de rede ao conectar com a API do GitHub.",
        details: { authenticated: false, repoFound: false, branchFound: false },
        rateLimit: this.getRateLimitInfo(),
      };
    }
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
   * Fallback git local se disponível
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
   * Cache persistente em banco de dados
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

  private async savePersistentCache(commits: GitHubCommitInfo[]) {
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
   * Consulta a lista de commits reais diretamente no GitHub com deduplicação, cache e proteção de rate limit
   */
  async listRecentCommitsRaw(limit = 20, forceRefresh = false): Promise<GitHubCommitInfo[]> {
    const cfg = await this.getEffectiveConfig();
    const cacheKey = `${cfg.owner}/${cfg.repo}:${cfg.branch}:${limit}`;

    // 1. Cache em memória se não for forçado
    if (
      !forceRefresh &&
      this.recentCommitsCache &&
      this.recentCommitsCache.key === cacheKey &&
      Date.now() - this.recentCommitsCache.timestamp < this.CACHE_TTL_MS &&
      this.recentCommitsCache.data.length > 0
    ) {
      return this.recentCommitsCache.data.slice(0, limit);
    }

    // 2. Se estiver bloqueado por rate limit, usa imediatamente o cache sem disparar HTTP
    if (this.isRateLimited()) {
      if (this.recentCommitsCache && this.recentCommitsCache.data.length > 0) {
        return this.recentCommitsCache.data.slice(0, limit);
      }
      const cached = await this.getPersistentCache();
      if (cached.length > 0) {
        return cached.slice(0, limit);
      }
      const local = await this.getLocalGitCommits(limit);
      if (local.length > 0) return local.slice(0, limit);
    }

    // 3. Executa com deduplicação em voo
    return this.deduplicate(`listRecentCommitsRaw_${cacheKey}`, async () => {
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
        this.updateRateLimitFromHeaders(res.headers);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          if (res.status === 403 || res.status === 429) {
            this.rateLimitState.isRateLimited = true;
          }
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
          this.recentCommitsCache = { key: cacheKey, data: mapped, timestamp: Date.now() };
          await this.savePersistentCache(mapped);
        }

        return mapped.slice(0, limit);
      } catch (err) {
        // Fallback 1: cache em memória
        if (this.recentCommitsCache && this.recentCommitsCache.data.length > 0) {
          return this.recentCommitsCache.data.slice(0, limit);
        }
        // Fallback 2: cache persistente no banco
        const cached = await this.getPersistentCache();
        if (cached.length > 0) {
          return cached.slice(0, limit);
        }
        // Fallback 3: git log local
        const local = await this.getLocalGitCommits(limit);
        if (local.length > 0) {
          await this.savePersistentCache(local);
          return local.slice(0, limit);
        }

        throw err;
      }
    });
  }

  /**
   * Consulta o commit mais recente da branch principal com deduplicação e cache
   */
  async getLatestCommit(forceRefresh = false): Promise<GitHubCommitInfo> {
    const cfg = await this.getEffectiveConfig();
    const cacheKey = `${cfg.owner}/${cfg.repo}:${cfg.branch}`;

    // 1. Cache em memória se não for forçado
    if (
      !forceRefresh &&
      this.latestCommitCache &&
      this.latestCommitCache.key === cacheKey &&
      Date.now() - this.latestCommitCache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.latestCommitCache.data;
    }

    // 2. Se estiver rate limited, tenta retornar do cache
    if (this.isRateLimited()) {
      if (this.latestCommitCache) return this.latestCommitCache.data;
      const cached = await this.getPersistentCache();
      if (cached.length > 0 && cached[0]) return cached[0];
      const local = await this.getLocalGitCommits(1);
      if (local.length > 0 && local[0]) return local[0];
    }

    // 3. Executa com deduplicação
    return this.deduplicate(`getLatestCommit_${cacheKey}`, async () => {
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
        this.updateRateLimitFromHeaders(res.headers);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          if (res.status === 403 || res.status === 429) {
            this.rateLimitState.isRateLimited = true;
          }
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
        const info: GitHubCommitInfo = {
          sha: fullSha,
          shortSha: fullSha.slice(0, 7),
          message: (data.commit?.message || "Sem mensagem").split("\n")[0].trim(),
          author: data.commit?.author?.name || "Desconhecido",
          date: data.commit?.author?.date || new Date().toISOString(),
          url: data.html_url,
        };

        this.latestCommitCache = { key: cacheKey, data: info, timestamp: Date.now() };
        return info;
      } catch (err) {
        // Fallback: busca do cache recente ou git local
        if (this.latestCommitCache) return this.latestCommitCache.data;
        const raw = await this.listRecentCommitsRaw(1, forceRefresh).catch(() => []);
        if (raw.length > 0 && raw[0]) {
          return raw[0];
        }
        throw err;
      }
    });
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
   * Status de conexão do repositório com metadados de rate limit
   */
  async getRepoStatus(): Promise<GitHubRepoStatus> {
    const cfg = await this.getEffectiveConfig();
    const tokenConfigured = Boolean(cfg.token);
    const rateLimit = this.getRateLimitInfo();

    try {
      const latest = await this.getLatestCommit(false);
      return {
        connected: true,
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        latestCommit: latest,
        tokenConfigured,
        rateLimit,
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
          tokenConfigured,
          rateLimit,
          isCached: true,
        };
      }

      return {
        connected: false,
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        latestCommit: null,
        tokenConfigured,
        rateLimit,
        error: e instanceof Error ? e.message : "Não foi possível conectar ao GitHub",
      };
    }
  }
}

export const githubClient = new GitHubClient();
