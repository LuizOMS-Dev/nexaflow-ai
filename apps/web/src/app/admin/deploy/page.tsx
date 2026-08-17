"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommit,
  HelpCircle,
  History,
  KeyRound,
  Layers,
  RefreshCw,
  Rocket,
  RotateCcw,
  Server,
  Settings,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { formatDate, formatRelativeTime, cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import {
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  MetricCard,
  MetricGrid,
  StatusBadge,
} from "@/components/admin";
import { DialogFooter, FormField, Modal, useToast } from "@/components/ui";

type EasyPanelState = "CONNECTED" | "NOT_CONFIGURED" | "AUTH_FAILED" | "UNAVAILABLE" | "CHECKING";

type DeployOverviewResponse = {
  environment: string;
  isOnline: boolean;
  healthState: "HEALTHY" | "VALIDATING" | "DEGRADED" | "UNKNOWN";
  status: "UP_TO_DATE" | "UPDATE_AVAILABLE" | "DEPLOYING" | "UNKNOWN";
  currentCommit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    deployedAt: string | null;
    deployedBy: string | null;
    isKnown: boolean;
  } | null;
  latestGitHubCommit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    date: string;
    url?: string;
  } | null;
  gitHub: {
    connected: boolean;
    owner: string;
    repo: string;
    branch: string;
    error?: string;
  };
  easyPanel: {
    state: EasyPanelState;
    connected: boolean;
    url?: string;
    projectName: string;
    serviceName: string;
    serviceType: string;
    hasUrl: boolean;
    hasToken: boolean;
    error?: string;
  };
  activeDeployment: {
    id: string;
    status: string;
    branch: string;
    commitShortSha: string;
    commitMessage: string;
    startedAt: string;
    startedByName: string;
    durationSeconds: number;
  } | null;
};

type GitHubCommitItem = {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url?: string;
};

type EasyPanelConfigResponse = {
  configured: boolean;
  url: string;
  projectName: string;
  serviceName: string;
  tokenConfigured: boolean;
};

type TestConnectionResponse = {
  success: boolean;
  message: string;
  state: EasyPanelState;
  details?: {
    urlAccessible: boolean;
    authValid: boolean;
    projectFound: boolean;
    serviceFound: boolean;
  };
};

type HistoryItem = {
  id: string;
  environment: string;
  branch: string;
  commitSha: string;
  commitShortSha: string;
  commitMessage: string;
  commitAuthor?: string;
  startedBy: string;
  startedByEmail?: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  durationSeconds?: number;
  errorSummary?: string;
  healthStatus?: string;
  isRollback?: boolean;
  rollbackFromSha?: string;
};

type DeploymentDetail = {
  id: string;
  environment: string;
  branch: string;
  commitSha: string;
  commitShortSha: string;
  commitMessage: string;
  commitAuthor?: string;
  startedBy: string;
  status: string;
  services: string[];
  startedAt: string;
  finishedAt?: string;
  durationSeconds?: number;
  errorSummary?: string;
  logs: string;
  healthStatus?: string;
  healthCheckedAt?: string;
  isRollback?: boolean;
};

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function deployStatusTone(st: string): "brand" | "neutral" | "success" | "warning" | "danger" {
  switch (st) {
    case "COMPLETED":
    case "SUCCESS":
      return "success";
    case "FAILED":
      return "danger";
    case "BUILDING":
    case "DEPLOYING":
    case "VALIDATING":
    case "VERIFYING":
      return "brand";
    case "PREPARING":
    case "PENDING":
      return "warning";
    default:
      return "neutral";
  }
}

function deployStatusLabel(st: string): string {
  switch (st) {
    case "COMPLETED":
    case "SUCCESS":
      return "Sucesso";
    case "FAILED":
      return "Falhou";
    case "BUILDING":
      return "Compilando";
    case "DEPLOYING":
      return "Implantando";
    case "VALIDATING":
    case "VERIFYING":
      return "Validando saúde";
    case "PREPARING":
      return "Preparando";
    case "PENDING":
      return "Aguardando";
    default:
      return st;
  }
}

export default function AdminDeployPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedCommitToDeploy, setSelectedCommitToDeploy] = useState<GitHubCommitItem | null>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<HistoryItem | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [showAllCommits, setShowAllCommits] = useState(false);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const [isReplacingToken, setIsReplacingToken] = useState(false);
  const [page, setPage] = useState(1);

  // Form states do Modal de Configuração do EasyPanel (Write-Only)
  const [cfgUrl, setCfgUrl] = useState("");
  const [cfgProject, setCfgProject] = useState("");
  const [cfgService, setCfgService] = useState("");
  const [cfgToken, setCfgToken] = useState("");
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);

  // 1. Status geral de deploy
  const overviewQuery = useQuery({
    queryKey: ["admin-deploy-status"],
    queryFn: () => api<DeployOverviewResponse>("/admin/deploy/status"),
    enabled: user?.platformRole === "SUPERADMIN",
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.activeDeployment ? 4000 : 20000;
    },
  });

  // 2. Lista de commits recentes do GitHub
  const commitsQuery = useQuery({
    queryKey: ["admin-deploy-commits"],
    queryFn: () =>
      api<{ commits: GitHubCommitItem[] }>("/admin/deploy/commits?limit=15"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  // 3. Histórico de deploys
  const historyQuery = useQuery({
    queryKey: ["admin-deploy-history", page],
    queryFn: () =>
      api<{
        items: HistoryItem[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/admin/deploy/history?page=${page}&limit=10`),
    enabled: user?.platformRole === "SUPERADMIN",
    refetchInterval: () => (overviewQuery.data?.activeDeployment ? 5000 : false),
  });

  // 4. Detalhes do deploy selecionado
  const detailQuery = useQuery({
    queryKey: ["admin-deploy-detail", selectedDetailId],
    queryFn: () => api<DeploymentDetail>(`/admin/deploy/${selectedDetailId}`),
    enabled: Boolean(selectedDetailId) && user?.platformRole === "SUPERADMIN",
    refetchInterval: () =>
      overviewQuery.data?.activeDeployment?.id === selectedDetailId ? 3000 : false,
  });

  // 5. Configuração salva do EasyPanel (Write-Only)
  const configQuery = useQuery({
    queryKey: ["admin-deploy-config"],
    queryFn: () => api<EasyPanelConfigResponse>("/admin/deploy/config"),
    enabled: configModalOpen && user?.platformRole === "SUPERADMIN",
  });

  useEffect(() => {
    if (configQuery.data) {
      setCfgUrl(configQuery.data.url || "");
      setCfgProject(configQuery.data.projectName || "i9atendimento");
      setCfgService(configQuery.data.serviceName || "nexaflow");
      setCfgToken("");
      setIsReplacingToken(false);
      setTestResult(null);
    }
  }, [configQuery.data]);

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedSha(text);
    setTimeout(() => setCopiedSha(null), 2000);
    toast({
      title: "Copiado",
      description: `${label} copiado para a área de transferência.`,
      kind: "success",
    });
  };

  // Mutação: Testar conexão
  const testConnMut = useMutation({
    mutationFn: (body: { url: string; token?: string; projectName: string; serviceName: string }) =>
      api<TestConnectionResponse>("/admin/deploy/config/test", {
        method: "POST",
        json: body,
      }),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.success) {
        toast({ title: "Conexão estabelecida", description: res.message, kind: "success" });
      } else {
        toast({ title: "Falha na conexão", description: res.message, kind: "error" });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Não foi possível testar a conexão.";
      setTestResult({ success: false, state: "UNAVAILABLE", message: msg });
      toast({ title: "Erro no teste", description: msg, kind: "error" });
    },
  });

  // Mutação: Salvar configuração
  const saveConfigMut = useMutation({
    mutationFn: (body: { url: string; token?: string; projectName: string; serviceName: string }) =>
      api<{ success: boolean; message: string }>("/admin/deploy/config", {
        method: "POST",
        json: body,
      }),
    onSuccess: () => {
      setConfigModalOpen(false);
      setCfgToken("");
      setIsReplacingToken(false);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-config"] });
      toast({
        title: "Configuração salva",
        description: "Parâmetros do EasyPanel atualizados com sucesso.",
        kind: "success",
      });
    },
    onError: (e) => {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro interno ao salvar configuração.",
        kind: "error",
      });
    },
  });

  // Mutação: Iniciar deploy
  const startDeployMut = useMutation({
    mutationFn: (body?: { commitSha?: string; branch?: string }) =>
      api<{ deploymentId: string; status: string }>("/admin/deploy/start", {
        method: "POST",
        json: body || {},
      }),
    onSuccess: (res) => {
      setConfirmOpen(false);
      setSelectedCommitToDeploy(null);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      toast({
        title: "Deploy iniciado",
        description: "O processo de build e validação foi enviado ao EasyPanel.",
        kind: "success",
      });
      setSelectedDetailId(res.deploymentId);
    },
    onError: (e) => {
      toast({
        title: "Não foi possível iniciar o deploy",
        description: e instanceof Error ? e.message : "Erro interno ao processar a solicitação.",
        kind: "error",
      });
    },
  });

  // Mutação: Rollback
  const rollbackMut = useMutation({
    mutationFn: (id: string) =>
      api<{ deploymentId: string; status: string }>(`/admin/deploy/${id}/rollback`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      setRollbackOpen(false);
      setRollbackTarget(null);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      toast({
        title: "Rollback iniciado",
        description: "Reimplantando a versão anterior selecionada.",
        kind: "success",
      });
      setSelectedDetailId(res.deploymentId);
    },
    onError: (e) => {
      toast({
        title: "Falha ao iniciar rollback",
        description: e instanceof Error ? e.message : "Erro interno.",
        kind: "error",
      });
    },
  });

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (overviewQuery.isError) {
    if (isSuperadminMfaRequiredError(overviewQuery.error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar o módulo de deploy"
        description={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "Verifique a conexão e permissões do Superadmin."
        }
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  if (overviewQuery.isLoading || !overviewQuery.data) {
    return <AdminPageSkeleton metrics={4} />;
  }

  const data = overviewQuery.data;
  const current = data.currentCommit;
  const latest = data.latestGitHubCommit;
  const active = data.activeDeployment;
  const status = data.status; // "UP_TO_DATE" | "UPDATE_AVAILABLE" | "UNKNOWN" | "DEPLOYING"
  const isUpToDate = status === "UP_TO_DATE";
  const isUpdateAvailable = status === "UPDATE_AVAILABLE";
  const isUnknown = status === "UNKNOWN";

  const allCommits = commitsQuery.data?.commits || [];
  const displayedCommits = showAllCommits ? allCommits : allCommits.slice(0, 5);

  const historyItems = historyQuery.data?.items || [];
  const totalPages = historyQuery.data?.totalPages || 1;

  // Estados semânticos oficiais do EasyPanel
  const epState = data.easyPanel?.state || (data.easyPanel?.connected ? "CONNECTED" : "NOT_CONFIGURED");
  let epLabel = "Conectado";
  let epTone: "success" | "neutral" | "warning" | "danger" | "brand" = "success";
  let epHint = `${data.easyPanel?.projectName || "i9atendimento"} / ${data.easyPanel?.serviceName || "nexaflow"}`;

  if (epState === "NOT_CONFIGURED") {
    epLabel = "Não configurado";
    epTone = "neutral";
    epHint = "Configure a integração para habilitar deployments.";
  } else if (epState === "CHECKING") {
    epLabel = "Verificando";
    epTone = "brand";
    epHint = "Testando comunicação com o servidor...";
  } else if (epState === "UNAVAILABLE") {
    epLabel = "Indisponível";
    epTone = "warning";
    epHint = "Servidor EasyPanel temporariamente inacessível.";
  } else if (epState === "AUTH_FAILED") {
    epLabel = "Credenciais inválidas";
    epTone = "danger";
    epHint = "Token inválido ou sem permissão de acesso.";
  }

  const isFetchingAny = overviewQuery.isFetching || commitsQuery.isFetching;
  const tokenIsSaved = Boolean(configQuery.data?.tokenConfigured);

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <AdminPageHeader
        title="Deploy"
        description="Controle as versões implantadas em produção com integração direta GitHub → EasyPanel."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="admin-btn-ghost h-9 text-[12.5px]"
              onClick={() => setConfigModalOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Configurar EasyPanel
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 text-[12.5px]"
              onClick={() => {
                void overviewQuery.refetch();
                void commitsQuery.refetch();
                void historyQuery.refetch();
                toast({
                  title: "Sincronizado",
                  description: "Buscando atualizações e commits recentes no GitHub...",
                  kind: "success",
                });
              }}
              disabled={isFetchingAny}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetchingAny && "animate-spin")} />
              Buscar atualizações no GitHub
            </button>
          </div>
        }
      />

      {/* 2. Grid de Métricas Principais */}
      <MetricGrid cols={4}>
        <MetricCard
          label="Ambiente"
          value="Produção"
          hint={active ? "Deploy em andamento…" : "Instância online e operacional"}
          icon={<Server className="h-4 w-4" />}
          tone={active ? "warning" : "success"}
          compact
        />

        <MetricCard
          label="Versão em Produção"
          value={current ? current.shortSha : "—"}
          hint={
            current?.deployedAt
              ? `Implantado há ${formatRelativeTime(current.deployedAt)}`
              : current ? "Versão base de implantação" : "Versão desconhecida"
          }
          icon={<GitCommit className="h-4 w-4" />}
          tone="brand"
          compact
        />

        <MetricCard
          label="Repositório GitHub"
          value={data.gitHub?.repo || "LuizOMS-Dev/nexaflow-ai"}
          hint={`Branch: ${data.gitHub?.branch || "main"}`}
          icon={<GitBranch className="h-4 w-4" />}
          tone={data.gitHub?.connected ? "neutral" : "danger"}
          compact
        />

        <MetricCard
          label="EasyPanel"
          value={epLabel}
          hint={epHint}
          icon={<Layers className="h-4 w-4" />}
          tone={epTone}
          compact
        />
      </MetricGrid>

      {/* 3. Banner de Deploy Ativo (se houver) */}
      {active ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4.5 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                <Rocket className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white text-[14px]">Deploy em andamento</h3>
                  <StatusBadge tone="warning" dot>
                    {deployStatusLabel(active.status)}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-[12.5px] text-gray-300">
                  Versão <code className="text-amber-300 font-mono">{active.commitShortSha}</code>: &quot;{active.commitMessage}&quot;
                </p>
                <p className="mt-1 text-[11.5px] text-gray-400">
                  Iniciado por <strong className="text-gray-200">{active.startedByName}</strong> · decorridos {formatDuration(active.durationSeconds)}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="admin-btn-secondary shrink-0 text-[12px]"
              onClick={() => setSelectedDetailId(active.id)}
            >
              <Terminal className="h-3.5 w-3.5" /> Ver logs em tempo real
            </button>
          </div>
        </div>
      ) : null}

      {/* 4. Card de Ação Principal: Comparativo de Versão */}
      <AdminSection
        title="Status da Versão"
        description="Comparação em tempo real entre a versão atual em produção e a branch principal no GitHub."
      >
        <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            {/* Lado Esquerdo: Detalhes dos Commits */}
            <div className="grid gap-4 sm:grid-cols-2 lg:flex-1">
              {/* Commit Atual */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                  Versão em Produção
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="rounded bg-white/[0.08] px-2 py-0.5 font-mono text-[13px] font-bold text-violet-300">
                    {current ? current.shortSha : "—"}
                  </code>
                  <span className="truncate text-[13px] font-medium text-gray-200" title={current?.message}>
                    {current ? current.message : "Sem versão registrada"}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-[11.5px] text-gray-400">
                  {current?.author ? `Autor: ${current.author}` : "—"}
                  {current?.deployedAt ? ` · ${formatDate(current.deployedAt)}` : ""}
                </p>
              </div>

              {/* Último no GitHub */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                  Último no GitHub ({data.gitHub?.branch || "main"})
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="rounded bg-white/[0.08] px-2 py-0.5 font-mono text-[13px] font-bold text-emerald-300">
                    {latest ? latest.shortSha : "—"}
                  </code>
                  <span className="truncate text-[13px] font-medium text-gray-200" title={latest?.message}>
                    {latest ? latest.message : "Nenhum commit retornado"}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-[11.5px] text-gray-400">
                  {latest?.author ? `Por ${latest.author}` : "—"}
                  {latest?.date ? ` · há ${formatRelativeTime(latest.date)}` : ""}
                </p>
              </div>
            </div>

            {/* Lado Direito: Ações & Estado */}
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
              {isUpToDate ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.1] px-3.5 py-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="text-[13px] font-semibold">Produção está atualizada</span>
                </div>
              ) : isUpdateAvailable ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/[0.1] px-3.5 py-2 text-amber-300">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span className="text-[13px] font-semibold">Nova versão disponível</span>
                </div>
              ) : isUnknown ? (
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-3.5 py-2 text-gray-300">
                  <HelpCircle className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="text-[13px] font-semibold">Não foi possível determinar a versão implantada</span>
                </div>
              ) : null}

              {/* Botão de deploy: se houver versão nova ou se versão for desconhecida */}
              {(isUpdateAvailable || isUnknown) ? (
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    type="button"
                    className="admin-btn-primary h-10 px-5 text-[13px] font-semibold"
                    disabled={Boolean(active) || startDeployMut.isPending || !data.easyPanel?.connected}
                    onClick={() => {
                      setSelectedCommitToDeploy(null);
                      setConfirmOpen(true);
                    }}
                  >
                    <Rocket className="h-4 w-4" />
                    {isUnknown ? "Implantar versão" : "Implantar nova versão"}
                  </button>

                  {!data.easyPanel?.connected ? (
                    <div className="flex items-center gap-1 text-[11px] text-gray-400">
                      <span>{epHint}</span>
                      <button
                        type="button"
                        className="text-violet-400 hover:underline"
                        onClick={() => setConfigModalOpen(true)}
                      >
                        Configurar integração
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </AdminSection>

      {/* 5. Seção de Commits Recentes no GitHub */}
      <AdminSection
        title="Atualizações Recentes no GitHub"
        description="Lista de commits da branch principal obtidos em tempo real via API oficial do GitHub."
        flush
      >
        {commitsQuery.isLoading ? (
          <div className="p-6 text-center text-[12px] text-gray-500">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-gray-400 mb-2" />
            Buscando commits mais recentes no GitHub...
          </div>
        ) : allCommits.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-gray-400">
            Nenhum commit encontrado no repositório.
          </div>
        ) : (
          <div>
            <div className="divide-y divide-white/[0.04]">
              {displayedCommits.map((c) => {
                const isCurrent = current?.sha === c.sha || (current?.shortSha === c.shortSha);
                const isCopied = copiedSha === c.shortSha;
                return (
                  <div
                    key={c.sha}
                    className="flex flex-col gap-2.5 px-4.5 py-3 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-gray-400">
                        <GitCommit className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="group flex items-center gap-1 rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12px] font-bold text-violet-300 hover:bg-violet-500/20"
                            onClick={() => copyToClipboard(c.shortSha, "Hash do commit")}
                            title="Clique para copiar o hash curto"
                          >
                            {c.shortSha}
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                          <span className="truncate text-[13px] font-medium text-gray-200" title={c.message}>
                            {c.message}
                          </span>
                          {isCurrent ? (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                              Em produção
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-gray-400">
                          Por <strong className="text-gray-300">{c.author}</strong> · há {formatRelativeTime(c.date)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn-ghost h-7 px-2 text-[11.5px] text-gray-400 hover:text-white"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver no GitHub
                        </a>
                      ) : null}

                      {!isCurrent && !active && data.easyPanel?.connected ? (
                        <button
                          type="button"
                          className="admin-btn-secondary h-7 px-2.5 text-[11.5px]"
                          onClick={() => {
                            setSelectedCommitToDeploy(c);
                            setConfirmOpen(true);
                          }}
                        >
                          <Rocket className="h-3 w-3" /> Implantar
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {allCommits.length > 5 ? (
              <div className="border-t border-white/[0.04] p-2.5 text-center">
                <button
                  type="button"
                  className="admin-btn-ghost h-7 px-3 text-[12px] text-gray-400 hover:text-white"
                  onClick={() => setShowAllCommits((s) => !s)}
                >
                  {showAllCommits ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" /> Mostrar menos commits
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" /> Ver mais commits ({allCommits.length})
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </AdminSection>

      {/* 6. Histórico de Implantações */}
      <AdminSection
        title="Histórico de Deploys"
        description="Registro auditável de todas as implantações, durações e validações de saúde."
        flush
      >
        {historyItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] text-gray-400">
              <History className="h-4.5 w-4.5" strokeWidth={1.5} />
            </div>
            <p className="mt-2 text-[13px] font-medium text-gray-300">Nenhum deploy registrado</p>
            <p className="mt-0.5 text-[11.5px] text-gray-500">
              O histórico de implantações aparecerá aqui assim que o primeiro deploy for concluído.
            </p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap overflow-x-auto">
              <table className="admin-table w-full min-w-[760px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="w-[18%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Commit
                    </th>
                    <th className="w-[26%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Mensagem
                    </th>
                    <th className="w-[16%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Responsável
                    </th>
                    <th className="w-[14%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Data & Duração
                    </th>
                    <th className="w-[12%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Status
                    </th>
                    <th className="w-[14%] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => {
                    const isItemCurrent = current?.sha === item.commitSha;
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.025]"
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-[12.5px] font-semibold text-violet-300">
                              {item.commitShortSha}
                            </code>
                            {item.isRollback ? (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                                Rollback
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <p className="max-w-xs truncate text-[13px] font-medium text-gray-200" title={item.commitMessage}>
                            {item.commitMessage}
                          </p>
                          {item.errorSummary ? (
                            <p className="mt-0.5 max-w-xs truncate text-[11px] text-rose-400">
                              {item.errorSummary}
                            </p>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 align-middle text-[12.5px] text-gray-300">
                          {item.startedBy}
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <span className="block text-[12.5px] text-gray-300">
                            {formatDate(item.startedAt)}
                          </span>
                          <span className="block text-[11px] text-gray-500">
                            {formatDuration(item.durationSeconds)}
                          </span>
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <StatusBadge tone={deployStatusTone(item.status)} dot={item.status !== "COMPLETED" && item.status !== "FAILED"}>
                            {deployStatusLabel(item.status)}
                          </StatusBadge>
                        </td>

                        <td className="px-4 py-3 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="admin-btn-ghost h-8 px-2.5 text-[12px]"
                              onClick={() => setSelectedDetailId(item.id)}
                            >
                              <Terminal className="h-3.5 w-3.5" /> Detalhes
                            </button>

                            {item.status === "COMPLETED" && !isItemCurrent && !active && data.easyPanel?.connected ? (
                              <button
                                type="button"
                                className="admin-btn-ghost h-8 px-2.5 text-[12px] text-amber-300 hover:text-amber-200"
                                onClick={() => {
                                  setRollbackTarget(item);
                                  setRollbackOpen(true);
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-[12px] text-gray-400">
                <span>Total de {historyQuery.data?.total || 0} deploys</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="admin-btn-ghost h-8 px-3 text-[12px] disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="text-gray-300">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="admin-btn-ghost h-8 px-3 text-[12px] disabled:opacity-40"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </AdminSection>

      {/* MODAL 1: Confirmação de Deploy */}
      <Modal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setSelectedCommitToDeploy(null);
        }}
        title="Implantar em produção?"
        description="Confirme os detalhes da versão antes de enviar o comando ao EasyPanel."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              onClick={() => {
                setConfirmOpen(false);
                setSelectedCommitToDeploy(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9"
              disabled={startDeployMut.isPending}
              onClick={() =>
                startDeployMut.mutate({
                  commitSha: selectedCommitToDeploy?.sha,
                })
              }
            >
              {startDeployMut.isPending ? "Iniciando deploy…" : "Implantar em produção"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3.5 py-1 text-[13px]">
          <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3.5 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Ambiente:</span>
              <span className="font-semibold text-emerald-400">Produção</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Produção atual:</span>
              <span className="font-mono text-gray-300">
                {current ? current.shortSha : "Versão desconhecida"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Versão selecionada:</span>
              <code className="font-mono font-bold text-violet-300">
                {selectedCommitToDeploy ? selectedCommitToDeploy.shortSha : latest ? latest.shortSha : "main"}
              </code>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Branch:</span>
              <span className="font-medium text-white">{data.gitHub?.branch || "main"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Commit:</span>
              <span
                className="max-w-[240px] truncate text-right font-medium text-white"
                title={selectedCommitToDeploy ? selectedCommitToDeploy.message : latest?.message}
              >
                {selectedCommitToDeploy ? selectedCommitToDeploy.message : latest ? latest.message : "Última versão"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Serviços afetados:</span>
              <span className="font-mono text-[12px] text-gray-300">api, web</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/[0.08] p-3 text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <p className="text-[12px] leading-relaxed">
              O NexaFlow iniciará o build automatizado no EasyPanel, atualizará os containers de API e Web e verificará os endpoints de integridade pós-deploy.
            </p>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: Confirmação de Rollback */}
      <Modal
        open={rollbackOpen && Boolean(rollbackTarget)}
        onClose={() => {
          setRollbackOpen(false);
          setRollbackTarget(null);
        }}
        title={`Restaurar versão ${rollbackTarget?.commitShortSha}?`}
        description="Você está prestes a reverter a produção para uma versão anterior bem-sucedida."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              onClick={() => setRollbackOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 bg-amber-600 hover:bg-amber-500"
              disabled={rollbackMut.isPending}
              onClick={() => rollbackTarget && rollbackMut.mutate(rollbackTarget.id)}
            >
              {rollbackMut.isPending ? "Restaurando…" : "Confirmar restauração"}
            </button>
          </DialogFooter>
        }
      >
        {rollbackTarget ? (
          <div className="space-y-3.5 py-1 text-[13px]">
            <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3.5 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Versão alvo:</span>
                <code className="font-mono font-bold text-amber-300">
                  {rollbackTarget.commitShortSha}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Mensagem:</span>
                <span className="max-w-[240px] truncate text-right font-medium text-white">
                  {rollbackTarget.commitMessage}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Serviços afetados:</span>
                <span className="font-mono text-[12px] text-gray-300">api, web</span>
              </div>
            </div>
            <p className="text-[12px] text-gray-300">
              Esta ação gerará uma nova implantação no histórico e validará a integridade do sistema pós-restauração.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* MODAL 3: Visualizador de Detalhes & Logs */}
      <Modal
        open={Boolean(selectedDetailId)}
        onClose={() => setSelectedDetailId(null)}
        title="Detalhes da Implantação"
        description={
          detailQuery.data
            ? `Deploy ${detailQuery.data.commitShortSha} — ${deployStatusLabel(detailQuery.data.status)}`
            : "Carregando detalhes…"
        }
        size="xl"
        footer={
          <div className="flex w-full justify-between items-center">
            <button
              type="button"
              className="admin-btn-ghost h-9 text-[12px]"
              onClick={() => {
                if (detailQuery.data?.logs) {
                  void navigator.clipboard.writeText(detailQuery.data.logs);
                  toast({ title: "Copiado", description: "Logs copiados para a área de transferência.", kind: "success" });
                }
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copiar logs
            </button>
            <button
              type="button"
              className="admin-btn-secondary h-9 text-[12px]"
              onClick={() => setSelectedDetailId(null)}
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {detailQuery.isLoading ? (
            <p className="text-gray-500 font-mono text-[12px]">Carregando detalhes do deploy…</p>
          ) : detailQuery.data ? (
            <>
              {/* Resumo das etapas */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-[12px]">
                <div className="rounded-lg bg-white/[0.03] p-2.5 border border-white/[0.06]">
                  <span className="text-gray-400 text-[11px] block">Status</span>
                  <StatusBadge tone={deployStatusTone(detailQuery.data.status)}>
                    {deployStatusLabel(detailQuery.data.status)}
                  </StatusBadge>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2.5 border border-white/[0.06]">
                  <span className="text-gray-400 text-[11px] block">Duração</span>
                  <span className="font-semibold text-white">{formatDuration(detailQuery.data.durationSeconds)}</span>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2.5 border border-white/[0.06]">
                  <span className="text-gray-400 text-[11px] block">Saúde Final</span>
                  <span className="font-semibold text-emerald-400">{detailQuery.data.healthStatus || "OK"}</span>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2.5 border border-white/[0.06]">
                  <span className="text-gray-400 text-[11px] block">Iniciado Por</span>
                  <span className="font-semibold text-white truncate block">{detailQuery.data.startedBy}</span>
                </div>
              </div>

              {/* Logs */}
              <div className="rounded-xl border border-white/[0.08] bg-[#07080a] p-4 text-[12px]">
                <span className="text-gray-400 text-[11px] uppercase tracking-wider block mb-2">Logs de Execução</span>
                {detailQuery.data.logs ? (
                  <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap font-mono text-emerald-400 leading-relaxed scrollbar-thin">
                    {detailQuery.data.logs}
                  </pre>
                ) : (
                  <p className="text-gray-500 font-mono">Nenhum log registrado para este deploy.</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      {/* MODAL 4: Área Segura de Configuração do EasyPanel (Write-Only Secrets) */}
      <Modal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title="Integração com o EasyPanel"
        description="Configure a conexão utilizada para implantar novas versões em produção."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              onClick={() => setConfigModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-ghost h-9 text-brand-300 hover:text-brand-200"
              disabled={testConnMut.isPending || !cfgUrl.trim() || !cfgProject.trim() || !cfgService.trim()}
              onClick={() =>
                testConnMut.mutate({
                  url: cfgUrl,
                  token: cfgToken.trim() || undefined,
                  projectName: cfgProject,
                  serviceName: cfgService,
                })
              }
            >
              <RefreshCw className={cn("h-3.5 w-3.5", testConnMut.isPending && "animate-spin")} />
              {testConnMut.isPending ? "Testando…" : "Testar conexão"}
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9"
              disabled={saveConfigMut.isPending || !cfgUrl.trim() || !cfgProject.trim() || !cfgService.trim()}
              onClick={() =>
                saveConfigMut.mutate({
                  url: cfgUrl,
                  token: cfgToken.trim() || undefined,
                  projectName: cfgProject,
                  serviceName: cfgService,
                })
              }
            >
              {saveConfigMut.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4 py-1">
          {/* Campo: URL do EasyPanel */}
          <FormField label="URL do servidor EasyPanel" required hint="Endereço HTTPS completo da sua instância EasyPanel">
            <input
              type="url"
              className="input"
              placeholder="https://easypanel.dominio.com.br"
              value={cfgUrl}
              onChange={(e) => setCfgUrl(e.target.value)}
            />
          </FormField>

          {/* Grid: Projeto e Serviço */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Projeto" required hint="Nome do projeto no painel">
              <input
                type="text"
                className="input"
                placeholder="i9atendimento"
                value={cfgProject}
                onChange={(e) => setCfgProject(e.target.value)}
              />
            </FormField>

            <FormField label="Serviço / Compose" required hint="Nome do serviço compose">
              <input
                type="text"
                className="input"
                placeholder="nexaflow"
                value={cfgService}
                onChange={(e) => setCfgService(e.target.value)}
              />
            </FormField>
          </div>

          {/* Campo: Credencial / Token da API (Write-Only) */}
          {tokenIsSaved ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-[13px] font-semibold text-emerald-300">Token configurado</span>
                </div>
                {!isReplacingToken ? (
                  <button
                    type="button"
                    className="admin-btn-secondary h-7 px-2.5 text-[11.5px]"
                    onClick={() => {
                      setIsReplacingToken(true);
                      setCfgToken("");
                    }}
                  >
                    <KeyRound className="h-3 w-3" /> Substituir token
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-2 text-[11.5px] text-gray-400 hover:text-white"
                    onClick={() => {
                      setIsReplacingToken(false);
                      setCfgToken("");
                    }}
                  >
                    Cancelar substituição
                  </button>
                )}
              </div>

              {!isReplacingToken ? (
                <p className="text-[11.5px] text-gray-400 leading-relaxed">
                  Por segurança, credenciais existentes nunca são exibidas ou trafegadas para o navegador.
                </p>
              ) : (
                <div className="pt-2 border-t border-white/[0.06]">
                  <FormField
                    label="Novo token da API"
                    hint="Insira uma nova chave de API para rotacionar a credencial existente."
                  >
                    <input
                      type="password"
                      className="input"
                      placeholder="Insira o novo token de API"
                      value={cfgToken}
                      onChange={(e) => setCfgToken(e.target.value)}
                      autoComplete="new-password"
                    />
                  </FormField>
                </div>
              )}
            </div>
          ) : (
            <FormField
              label="Token da API (EasyPanel API Key)"
              required
              hint="O token é tratado como segredo write-only e criptografado em repouso no servidor (AES-256-GCM)."
            >
              <input
                type="password"
                className="input"
                placeholder="Insira uma nova chave de API"
                value={cfgToken}
                onChange={(e) => setCfgToken(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
          )}

          {/* Banner de Resultado do Teste de Conexão */}
          {testResult ? (
            <div
              className={cn(
                "rounded-xl p-3.5 text-[12.5px] flex items-start gap-2.5 border transition-all",
                testResult.success
                  ? "bg-emerald-500/[0.08] text-emerald-300 border-emerald-500/20"
                  : "bg-rose-500/[0.08] text-rose-300 border-rose-500/20"
              )}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <div>
                <p className="font-semibold">{testResult.message}</p>
                {testResult.details ? (
                  <p className="mt-1 text-[11px] opacity-80 leading-relaxed">
                    URL: {testResult.details.urlAccessible ? "OK" : "Inacessível"} · Autenticação: {testResult.details.authValid ? "OK" : "Inválida"} · Projeto: {testResult.details.projectFound ? "OK" : "Não encontrado"} · Serviço: {testResult.details.serviceFound ? "OK" : "Não encontrado"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
