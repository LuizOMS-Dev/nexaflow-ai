"use client";

import { useEffect, useRef, useState } from "react";
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
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  Server,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
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
import { ActionMenu } from "@/components/ui-menu";

type EasyPanelState = "CONNECTED" | "NOT_CONFIGURED" | "AUTH_FAILED" | "UNAVAILABLE" | "CHECKING";

type DeploymentStatus =
  | "PENDING"
  | "PREPARING"
  | "BUILDING"
  | "DEPLOYING"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED";

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
    status: DeploymentStatus;
    stage: DeploymentStatus;
    branch: string;
    commitShortSha: string;
    commitMessage: string;
    startedAt: string;
    startedByName: string;
    durationSeconds: number;
    healthStatus: string;
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
  status: DeploymentStatus;
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
  startedByEmail?: string;
  status: DeploymentStatus;
  stage: DeploymentStatus;
  services: string[];
  startedAt: string;
  finishedAt?: string;
  durationSeconds?: number;
  errorSummary?: string;
  logs: string;
  healthStatus?: string;
  apiHealth?: string;
  webHealth?: string;
  healthCheckedAt?: string;
  isRollback?: boolean;
  rollbackFromSha?: string;
};

const STAGES: Array<{ id: DeploymentStatus; label: string }> = [
  { id: "PREPARING", label: "Preparando" },
  { id: "BUILDING", label: "Compilando" },
  { id: "DEPLOYING", label: "Implantando" },
  { id: "VALIDATING", label: "Verificando" },
];

function getStageIndex(status: DeploymentStatus): number {
  switch (status) {
    case "PENDING":
    case "PREPARING":
      return 0;
    case "BUILDING":
      return 1;
    case "DEPLOYING":
      return 2;
    case "VALIDATING":
      return 3;
    case "COMPLETED":
      return 4;
    case "FAILED":
      return -1;
    default:
      return 0;
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function deployStatusTone(st: DeploymentStatus): "brand" | "neutral" | "success" | "warning" | "danger" {
  switch (st) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "danger";
    case "BUILDING":
    case "DEPLOYING":
    case "VALIDATING":
      return "brand";
    case "PREPARING":
    case "PENDING":
      return "warning";
    default:
      return "neutral";
  }
}

function deployStatusLabel(st: DeploymentStatus): string {
  switch (st) {
    case "COMPLETED":
      return "Concluído";
    case "FAILED":
      return "Falhou";
    case "BUILDING":
      return "Compilando";
    case "DEPLOYING":
      return "Implantando";
    case "VALIDATING":
      return "Verificando";
    case "PREPARING":
      return "Preparando";
    case "PENDING":
      return "Aguardando";
    default:
      return st;
  }
}

function healthStatusLabel(status: DeploymentStatus, health?: string): string {
  if (status === "COMPLETED" || health === "HEALTHY") {
    return "Saudável";
  }
  if (status === "VALIDATING" || health === "VERIFYING") {
    return "Verificando";
  }
  if (status === "FAILED") {
    return health === "UNHEALTHY" ? "Falha na validação" : "Falha na execução";
  }
  return "Aguardando validação";
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
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [visibleCommitCount, setVisibleCommitCount] = useState(5);
  const [isReplacingToken, setIsReplacingToken] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [page, setPage] = useState(1);

  const logContainerRef = useRef<HTMLPreElement | null>(null);

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
      return data?.activeDeployment ? 3000 : 20000;
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
    refetchInterval: () => (overviewQuery.data?.activeDeployment ? 4000 : false),
  });

  // 4. Detalhes do deploy selecionado
  const detailQuery = useQuery({
    queryKey: ["admin-deploy-detail", selectedDetailId],
    queryFn: () => api<DeploymentDetail>(`/admin/deploy/${selectedDetailId}`),
    enabled: Boolean(selectedDetailId) && user?.platformRole === "SUPERADMIN",
    refetchInterval: () =>
      overviewQuery.data?.activeDeployment?.id === selectedDetailId ? 2500 : false,
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

  // Auto-scroll logs
  useEffect(() => {
    if (autoScrollLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [detailQuery.data?.logs, autoScrollLogs]);

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${label} copiado para a área de transferência.`,
      kind: "success",
    });
  };

  // Mutação: Limpar histórico visual de commits do GitHub
  const clearHistoryMut = useMutation({
    mutationFn: () =>
      api<{ success: boolean; message: string }>("/admin/deploy/commits/clear", {
        method: "POST",
      }),
    onSuccess: () => {
      setClearHistoryOpen(false);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      toast({
        title: "Histórico de atualizações limpo",
        description: "Os commits continuam disponíveis normalmente no GitHub.",
        kind: "success",
      });
    },
    onError: (e) => {
      toast({
        title: "Não foi possível limpar o histórico",
        description: e instanceof Error ? e.message : "Erro interno ao limpar histórico visual.",
        kind: "error",
      });
    },
  });

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
  const displayedCommits = allCommits.slice(0, visibleCommitCount);

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

  const activeStageIdx = active ? getStageIndex(active.stage || active.status) : 0;

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
              className="admin-btn-ghost h-9 text-[12.5px]"
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

      {/* 2. Grid de Métricas Principais (Compactos e Coerentes) */}
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
          value={current ? current.shortSha : "Não identificada"}
          hint={
            current?.deployedAt
              ? `Implantado há ${formatRelativeTime(current.deployedAt)}`
              : current ? "Versão base de implantação" : "Nenhum deploy registrado"
          }
          icon={<GitCommit className="h-4 w-4" />}
          tone={current ? "brand" : "neutral"}
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

      {/* 3. Painel de Deploy Ativo (Experiência Premium com Stepper Horizontal) */}
      {active ? (
        <div className="rounded-xl border border-violet-500/25 bg-[#0e1017] p-4 text-white shadow-[0_8px_24px_-8px_rgba(124,58,237,0.15)]">
          <div className="flex flex-col gap-3.5">
            {/* Topo: Título + Botão Ver Detalhes */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                  <Rocket className="h-3.5 w-3.5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-[13.5px]">Implantação em andamento</h3>
                    <code className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[11.5px] font-bold text-violet-300">
                      {active.commitShortSha}
                    </code>
                  </div>
                  <p className="text-[11.5px] text-gray-400 truncate max-w-lg">
                    &quot;{active.commitMessage}&quot; · Iniciado por <strong className="text-gray-300">{active.startedByName}</strong> · há {formatDuration(active.durationSeconds)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="admin-btn-secondary h-7.5 px-3 text-[11.5px] shrink-0"
                onClick={() => setSelectedDetailId(active.id)}
              >
                <Terminal className="h-3 w-3" /> Ver detalhes
              </button>
            </div>

            {/* Stepper Horizontal Discreto */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
              {STAGES.map((st, idx) => {
                const isPast = activeStageIdx > idx;
                const isCurrent = activeStageIdx === idx;
                const isFuture = activeStageIdx < idx;

                return (
                  <div
                    key={st.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] border transition-all",
                      isCurrent
                        ? "bg-violet-500/[0.12] border-violet-500/30 text-white font-medium shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                        : isPast
                        ? "bg-white/[0.02] border-white/[0.06] text-gray-300"
                        : "bg-transparent border-transparent text-gray-500"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold transition-all",
                        isPast
                          ? "bg-emerald-500/20 text-emerald-400"
                          : isCurrent
                          ? "bg-violet-500 text-white"
                          : "bg-white/[0.06] text-gray-400"
                      )}
                    >
                      {isPast ? (
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      ) : isCurrent ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span className="truncate">{st.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Rodapé Informativo */}
            <div className="flex flex-wrap items-center justify-between text-[11.5px] text-gray-400 pt-1">
              <span>
                Etapa atual: <strong className="text-violet-300 font-semibold">{deployStatusLabel(active.stage || active.status)}</strong>
              </span>
              <span>
                Saúde final: <strong className="text-gray-300">{healthStatusLabel(active.status, active.healthStatus)}</strong>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 4. Bloco Compacto: Status da Versão + CTA Principal */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-4.5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Lado Esquerdo: 2 Colunas de Versão (Produção vs GitHub) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex-1">
            {/* Produção Atual */}
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                Versão em Produção
              </span>
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12.5px] font-bold text-violet-300">
                  {current ? current.shortSha : "Não identificada"}
                </code>
                <span className="truncate text-[12.5px] text-gray-300" title={current?.message}>
                  {current ? current.message : "Sem versão registrada"}
                </span>
              </div>
            </div>

            {/* Último no GitHub */}
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                Último no GitHub ({data.gitHub?.branch || "main"})
              </span>
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12.5px] font-bold text-emerald-300">
                  {latest ? latest.shortSha : "—"}
                </code>
                <span className="truncate text-[12.5px] text-gray-300" title={latest?.message}>
                  {latest ? latest.message : "Nenhum commit retornado"}
                </span>
              </div>
            </div>
          </div>

          {/* Lado Direito: Status Semântico + CTA Único Principal */}
          <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
            {isUpToDate ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.1] px-3 py-1.5 text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="text-[12.5px] font-semibold">Produção atualizada</span>
              </div>
            ) : isUpdateAvailable ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/[0.1] px-3 py-1.5 text-amber-300">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="text-[12.5px] font-semibold">Atualização disponível</span>
              </div>
            ) : isUnknown ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-gray-300">
                <HelpCircle className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="text-[12.5px] font-semibold">Versão atual não identificada</span>
              </div>
            ) : null}

            {/* Único Botão de Ação Principal */}
            {(isUpdateAvailable || isUnknown) ? (
              <button
                type="button"
                className="admin-btn-primary h-9 px-4 text-[12.5px] font-semibold"
                disabled={Boolean(active) || startDeployMut.isPending || !data.easyPanel?.connected}
                onClick={() => {
                  setSelectedCommitToDeploy(null);
                  setConfirmOpen(true);
                }}
              >
                <Rocket className="h-3.5 w-3.5" />
                {isUnknown ? "Implantar versão" : "Implantar versão mais recente"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 5. Commits Recentes no GitHub (Compacto com Menu ⋯ e Ação Limpar Histórico) */}
      <AdminSection
        title="Atualizações Recentes no GitHub"
        description="Histórico recente da branch principal no GitHub."
        action={
          allCommits.length > 0 ? (
            <button
              type="button"
              className="admin-btn-ghost h-7 px-2 text-[11.5px] text-gray-400 hover:text-rose-400"
              onClick={() => setClearHistoryOpen(true)}
              title="Limpar histórico visual de atualizações exibido neste painel"
            >
              <Trash2 className="h-3 w-3" /> Limpar histórico
            </button>
          ) : null
        }
        flush
      >
        {commitsQuery.isLoading ? (
          <div className="p-6 text-center text-[12px] text-gray-500">
            <RefreshCw className="mx-auto h-4 w-4 animate-spin text-gray-400 mb-1.5" />
            Buscando commits recentes...
          </div>
        ) : allCommits.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] text-gray-400">
              <GitCommit className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <p className="mt-1.5 text-[12.5px] font-medium text-gray-300">Nenhuma atualização nova</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Novos commits da branch main aparecerão aqui.
            </p>
          </div>
        ) : (
          <div>
            <div className="divide-y divide-white/[0.04]">
              {displayedCommits.map((c, index) => {
                const isCurrent = current?.sha === c.sha || (current?.shortSha === c.shortSha);
                const isLatest = index === 0 && !isCurrent && isUpdateAvailable;

                return (
                  <div
                    key={c.sha}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                  >
                    {/* Informações do Commit */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12px] font-bold text-violet-300 shrink-0">
                        {c.shortSha}
                      </code>

                      <p className="truncate text-[13px] font-medium text-gray-200" title={c.message}>
                        {c.message}
                      </p>

                      {isCurrent ? (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 shrink-0">
                          Em produção
                        </span>
                      ) : isLatest ? (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 shrink-0">
                          Mais recente
                        </span>
                      ) : null}

                      <span className="hidden sm:inline text-[11.5px] text-gray-500 truncate shrink-0">
                        · {c.author} · {formatRelativeTime(c.date)}
                      </span>
                    </div>

                    {/* Menu Contextual ⋯ */}
                    <div className="shrink-0">
                      <ActionMenu
                        align="right"
                        aria-label={`Ações para commit ${c.shortSha}`}
                        items={[
                          ...(c.url
                            ? [
                                {
                                  label: "Ver no GitHub",
                                  icon: ExternalLink,
                                  onClick: () => window.open(c.url, "_blank", "noreferrer"),
                                },
                              ]
                            : []),
                          {
                            label: "Copiar SHA",
                            icon: Copy,
                            onClick: () => copyToClipboard(c.sha, "SHA do commit"),
                          },
                          ...(!isCurrent
                            ? [
                                {
                                  label: "Implantar esta versão",
                                  icon: Rocket,
                                  disabled: Boolean(active) || !data.easyPanel?.connected,
                                  onClick: () => {
                                    setSelectedCommitToDeploy(c);
                                    setConfirmOpen(true);
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ação Expandir / Recolher */}
            {allCommits.length > 5 ? (
              <div className="border-t border-white/[0.04] p-2 text-center">
                {visibleCommitCount < allCommits.length ? (
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-3 text-[11.5px] text-gray-400 hover:text-white"
                    onClick={() => setVisibleCommitCount((c) => Math.min(allCommits.length, c + 5))}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    Ver mais commits ({allCommits.length - visibleCommitCount} restantes)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-3 text-[11.5px] text-gray-400 hover:text-white"
                    onClick={() => setVisibleCommitCount(5)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    Mostrar menos
                  </button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </AdminSection>

      {/* 6. Histórico de Implantações (Destaque Principal) */}
      <AdminSection
        title="Histórico de Deploys"
        description="Registro auditável de todas as implantações, durações e validações de saúde."
        flush
      >
        {historyItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] text-gray-400">
              <History className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <p className="mt-1.5 text-[12.5px] font-medium text-gray-300">Nenhum deploy registrado</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              O histórico de implantações aparecerá aqui assim que o primeiro deploy for concluído.
            </p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap overflow-x-auto">
              <table className="admin-table w-full min-w-[720px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="w-[18%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Versão
                    </th>
                    <th className="w-[18%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Data
                    </th>
                    <th className="w-[18%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Responsável
                    </th>
                    <th className="w-[14%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Duração
                    </th>
                    <th className="w-[16%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Status
                    </th>
                    <th className="w-[16%] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
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
                        <td className="px-4 py-2.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <code className="font-mono text-[12px] font-semibold text-violet-300">
                              {item.commitShortSha}
                            </code>
                            {item.isRollback ? (
                              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9.5px] font-medium text-amber-300">
                                Rollback
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-2.5 align-middle text-gray-300">
                          {formatDate(item.startedAt)}
                        </td>

                        <td className="px-4 py-2.5 align-middle text-gray-300">
                          {item.startedBy}
                        </td>

                        <td className="px-4 py-2.5 align-middle text-gray-400">
                          {formatDuration(item.durationSeconds)}
                        </td>

                        <td className="px-4 py-2.5 align-middle">
                          <StatusBadge tone={deployStatusTone(item.status)} dot={item.status !== "COMPLETED" && item.status !== "FAILED"}>
                            {deployStatusLabel(item.status)}
                          </StatusBadge>
                        </td>

                        <td className="px-4 py-2.5 align-middle text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="admin-btn-ghost h-7 px-2 text-[11.5px]"
                              onClick={() => setSelectedDetailId(item.id)}
                            >
                              <Terminal className="h-3 w-3" /> Detalhes
                            </button>

                            {item.status === "COMPLETED" && !isItemCurrent && !active && data.easyPanel?.connected ? (
                              <button
                                type="button"
                                className="admin-btn-ghost h-7 px-2 text-[11.5px] text-amber-300 hover:text-amber-200"
                                onClick={() => {
                                  setRollbackTarget(item);
                                  setRollbackOpen(true);
                                }}
                              >
                                <RotateCcw className="h-3 w-3" /> Restaurar
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
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[11.5px] text-gray-400">
                <span>Total de {historyQuery.data?.total || 0} deploys</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-2.5 text-[11.5px] disabled:opacity-40"
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
                    className="admin-btn-ghost h-7 px-2.5 text-[11.5px] disabled:opacity-40"
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

      {/* MODAL 1: Confirmação de Deploy (Refinado e Seguro) */}
      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!startDeployMut.isPending) {
            setConfirmOpen(false);
            setSelectedCommitToDeploy(null);
          }
        }}
        title="Implantar em produção?"
        description="Confirme os detalhes da versão antes de enviar o comando ao EasyPanel."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              disabled={startDeployMut.isPending}
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
              disabled={
                startDeployMut.isPending ||
                Boolean(active) ||
                !data.easyPanel?.connected ||
                !(selectedCommitToDeploy || latest)
              }
              onClick={() => {
                const targetCommit = selectedCommitToDeploy || latest;
                startDeployMut.mutate({
                  commitSha: targetCommit?.sha,
                  branch: data.gitHub?.branch || "main",
                });
              }}
            >
              {startDeployMut.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Iniciando implantação…
                </>
              ) : (
                "Implantar em produção"
              )}
            </button>
          </DialogFooter>
        }
      >
        {(() => {
          const target = selectedCommitToDeploy || latest;
          const isEasyPanelOk = Boolean(data.easyPanel?.connected);
          const hasActive = Boolean(active);

          return (
            <div className="space-y-3.5 py-1 text-[12.5px]">
              {/* Bloco Estruturado de Informações */}
              <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3.5 space-y-3">
                {/* Linha 1: Ambiente e Branch */}
                <div className="grid grid-cols-2 gap-3 pb-2.5 border-b border-white/[0.05]">
                  <div>
                    <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                      Ambiente
                    </span>
                    <div className="mt-1 flex items-center gap-1.5 font-semibold text-emerald-400 text-[12.5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Produção
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                      Branch
                    </span>
                    <span className="mt-1 font-mono text-gray-200 text-[12.5px] block">
                      {data.gitHub?.branch || "main"}
                    </span>
                  </div>
                </div>

                {/* Linha 2: Versão Atual */}
                <div className="pb-2.5 border-b border-white/[0.05]">
                  <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                    Versão Atual
                  </span>
                  {current?.isKnown ? (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="font-mono font-semibold text-violet-300">
                        {current.shortSha}
                      </code>
                      {current.deployedAt ? (
                        <span className="text-gray-400 text-[11.5px]">
                          (implantado há {formatRelativeTime(current.deployedAt)})
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <span className="text-gray-300 font-medium">Versão atual não identificada</span>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        O NexaFlow passará a registrar a versão após uma implantação concluída com sucesso.
                      </p>
                    </div>
                  )}
                </div>

                {/* Linha 3: Nova Versão / Commit */}
                <div className="pb-2.5 border-b border-white/[0.05]">
                  <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                    Nova Versão
                  </span>
                  <div className="mt-1">
                    <code className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[12.5px] font-bold text-violet-300">
                      {target ? target.shortSha : "main"}
                    </code>
                    <p
                      className="mt-1 text-gray-200 text-[12px] line-clamp-2 leading-relaxed font-medium"
                      title={target?.message}
                    >
                      {target ? target.message : "Última versão da branch main"}
                    </p>
                  </div>
                </div>

                {/* Linha 4: Serviços Afetados */}
                <div>
                  <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold mb-1.5">
                    Serviços Afetados
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-gray-200">
                      API
                    </span>
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-gray-200">
                      Web
                    </span>
                  </div>
                </div>
              </div>

              {/* Aviso Operacional Discreto */}
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-2.5 text-amber-200/90 text-[11.5px] leading-relaxed">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400/90" />
                <p>
                  O EasyPanel executará o build e atualizará os serviços selecionados. Após a implantação, o NexaFlow validará API e Web antes de marcar o processo como concluído.
                </p>
              </div>

              {/* Alertas de Pré-checks (se houver impedimentos) */}
              {!isEasyPanelOk ? (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.08] p-2.5 text-rose-300 text-[11.5px] flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>EasyPanel não está conectado. Configure a integração antes de implantar.</span>
                </div>
              ) : hasActive ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.08] p-2.5 text-amber-300 text-[11.5px] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Já existe uma implantação em andamento no momento.</span>
                </div>
              ) : null}

              {/* Erro inline da mutação se houver */}
              {startDeployMut.isError ? (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.08] p-2.5 text-rose-300 text-[11.5px] flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>
                    {startDeployMut.error instanceof Error
                      ? startDeployMut.error.message
                      : "Não foi possível iniciar o deploy."}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })()}
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
          <div className="space-y-3 py-1 text-[13px]">
            <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3 space-y-2">
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
            </div>
            <p className="text-[12px] text-gray-300">
              Esta ação gerará uma nova implantação no histórico e validará a integridade do sistema pós-restauração.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* MODAL 3: Visualizador Operacional de Detalhes da Implantação (Redesenhado) */}
      <Modal
        open={Boolean(selectedDetailId)}
        onClose={() => setSelectedDetailId(null)}
        title="Detalhes da Implantação"
        description={
          detailQuery.data
            ? `${detailQuery.data.commitShortSha} · ${deployStatusLabel(detailQuery.data.stage || detailQuery.data.status)} — "${detailQuery.data.commitMessage}"`
            : "Carregando detalhes…"
        }
        size="lg"
        footer={
          <div className="flex w-full justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="admin-btn-ghost h-8 px-2.5 text-[11.5px]"
                onClick={() => {
                  if (detailQuery.data?.logs) {
                    void navigator.clipboard.writeText(detailQuery.data.logs);
                    toast({ title: "Copiado", description: "Logs copiados para a área de transferência.", kind: "success" });
                  }
                }}
              >
                <Copy className="h-3 w-3" /> Copiar logs
              </button>
            </div>
            <button
              type="button"
              className="admin-btn-secondary h-8 px-4 text-[12px]"
              onClick={() => setSelectedDetailId(null)}
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {detailQuery.isLoading ? (
            <p className="text-gray-500 font-mono text-[12px] py-4 text-center">Carregando detalhes do deploy…</p>
          ) : detailQuery.data ? (
            <>
              {/* 1. Progresso (Stepper Horizontal) */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Progresso</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STAGES.map((st, idx) => {
                    const detailStageIdx = getStageIndex(detailQuery.data!.stage || detailQuery.data!.status);
                    const isPast = detailStageIdx > idx;
                    const isCurrent = detailStageIdx === idx && detailQuery.data!.status !== "COMPLETED" && detailQuery.data!.status !== "FAILED";
                    const isFailed = detailQuery.data!.status === "FAILED" && detailStageIdx === idx;

                    return (
                      <div
                        key={st.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px] border transition-all",
                          isCurrent
                            ? "bg-violet-500/[0.12] border-violet-500/30 text-white font-medium shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                            : isFailed
                            ? "bg-rose-500/[0.12] border-rose-500/30 text-rose-300 font-medium"
                            : isPast
                            ? "bg-white/[0.02] border-white/[0.06] text-gray-300"
                            : "bg-transparent border-transparent text-gray-500"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                            isPast
                              ? "bg-emerald-500/20 text-emerald-400"
                              : isCurrent
                              ? "bg-violet-500 text-white"
                              : isFailed
                              ? "bg-rose-500 text-white"
                              : "bg-white/[0.06] text-gray-400"
                          )}
                        >
                          {isPast ? (
                            <Check className="h-3 w-3 stroke-[2.5]" />
                          ) : isCurrent ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isFailed ? (
                            <XCircle className="h-3 w-3" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <span className="truncate">{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Informações Gerais da Implantação */}
              <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3 text-[12.5px] space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  <div>
                    <span className="text-gray-400 text-[11px] block">Versão</span>
                    <code className="font-mono font-bold text-violet-300">{detailQuery.data.commitShortSha}</code>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px] block">Branch</span>
                    <span className="font-medium text-white">{detailQuery.data.branch}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px] block">Iniciado por</span>
                    <span className="font-medium text-white truncate block">{detailQuery.data.startedBy}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px] block">Início</span>
                    <span className="text-gray-300">{formatDate(detailQuery.data.startedAt)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px] block">Tempo decorrido</span>
                    <span className="font-medium text-white">{formatDuration(detailQuery.data.durationSeconds)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px] block">Serviços afetados</span>
                    <span className="font-mono text-gray-300 text-[11.5px]">api, web</span>
                  </div>
                </div>

                {detailQuery.data.errorSummary ? (
                  <div className="mt-2 rounded-lg bg-rose-500/[0.08] p-2.5 text-[12px] text-rose-300 border border-rose-500/20">
                    <strong className="block text-rose-200">Motivo da falha:</strong>
                    {detailQuery.data.errorSummary}
                  </div>
                ) : null}
              </div>

              {/* 3. Validação de Saúde dos Serviços */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Validação de Saúde</span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-[12.5px]">
                  {/* API */}
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3">
                    <span className="font-medium text-white">NexaFlow API</span>
                    {detailQuery.data.apiHealth === "HEALTHY" ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[12px]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Saudável
                      </span>
                    ) : detailQuery.data.apiHealth === "VERIFYING" ? (
                      <span className="flex items-center gap-1 text-violet-400 font-medium text-[12px]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando
                      </span>
                    ) : detailQuery.data.apiHealth === "UNHEALTHY" ? (
                      <span className="flex items-center gap-1 text-rose-400 font-semibold text-[12px]">
                        <XCircle className="h-3.5 w-3.5" /> Inacessível
                      </span>
                    ) : (
                      <span className="text-gray-500 text-[12px]">Aguardando validação</span>
                    )}
                  </div>

                  {/* Web */}
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3">
                    <span className="font-medium text-white">NexaFlow Web</span>
                    {detailQuery.data.webHealth === "HEALTHY" ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[12px]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Saudável
                      </span>
                    ) : detailQuery.data.webHealth === "VERIFYING" ? (
                      <span className="flex items-center gap-1 text-violet-400 font-medium text-[12px]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando
                      </span>
                    ) : detailQuery.data.webHealth === "UNHEALTHY" ? (
                      <span className="flex items-center gap-1 text-rose-400 font-semibold text-[12px]">
                        <XCircle className="h-3.5 w-3.5" /> Inacessível
                      </span>
                    ) : (
                      <span className="text-gray-500 text-[12px]">Aguardando validação</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Logs Operacionais Refinados */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-gray-400">
                  <span>Logs de Execução</span>
                  <button
                    type="button"
                    className="text-[11px] text-violet-400 hover:underline lowercase tracking-normal"
                    onClick={() => setAutoScrollLogs((s) => !s)}
                  >
                    Auto-scroll: {autoScrollLogs ? "ativo" : "pausado"}
                  </button>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-[#07080a] p-3.5 text-[11.5px]">
                  {detailQuery.data.logs ? (
                    <pre
                      ref={logContainerRef}
                      className="max-h-[30vh] overflow-y-auto whitespace-pre-wrap font-mono text-gray-300 leading-relaxed scrollbar-thin selection:bg-violet-500/30"
                    >
                      {detailQuery.data.logs.split("\n").map((line, lIdx) => {
                        if (!line) return null;
                        const isSuccess = line.includes("✓") || line.includes("[SUCCESS]");
                        const isFailed = line.includes("✕") || line.includes("[FAILED]") || line.includes("Falha");
                        const isWarn = line.includes("⚠") || line.includes("timeout");

                        return (
                          <div
                            key={lIdx}
                            className={cn(
                              "py-0.5",
                              isSuccess && "text-emerald-400 font-medium",
                              isFailed && "text-rose-400 font-medium",
                              isWarn && "text-amber-300"
                            )}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </pre>
                  ) : (
                    <p className="text-gray-500 font-mono text-[11.5px]">Nenhum log registrado para este deploy.</p>
                  )}
                </div>
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
                "rounded-xl p-3 text-[12px] flex items-start gap-2.5 border transition-all",
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
                  <p className="mt-0.5 text-[11px] opacity-80 leading-relaxed">
                    URL: {testResult.details.urlAccessible ? "OK" : "Inacessível"} · Autenticação: {testResult.details.authValid ? "OK" : "Inválida"} · Projeto: {testResult.details.projectFound ? "OK" : "Não encontrado"} · Serviço: {testResult.details.serviceFound ? "OK" : "Não encontrado"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* MODAL 5: Confirmação de Limpeza do Histórico Visual de Commits */}
      <Modal
        open={clearHistoryOpen}
        onClose={() => setClearHistoryOpen(false)}
        title="Limpar histórico de atualizações?"
        description="Os commits atualmente exibidos serão removidos deste painel. Nenhuma alteração será feita no GitHub, no código-fonte ou nas versões implantadas."
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              onClick={() => setClearHistoryOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 bg-rose-600 hover:bg-rose-500"
              disabled={clearHistoryMut.isPending}
              onClick={() => clearHistoryMut.mutate()}
            >
              {clearHistoryMut.isPending ? "Limpando…" : "Limpar histórico"}
            </button>
          </DialogFooter>
        }
      >
        <div className="py-2 text-[12.5px] text-gray-300">
          <p>
            Esta ação limpa exclusivamente a lista de visualização do painel. Novos commits enviados para a branch principal voltarão a aparecer aqui automaticamente.
          </p>
        </div>
      </Modal>
    </div>
  );
}
