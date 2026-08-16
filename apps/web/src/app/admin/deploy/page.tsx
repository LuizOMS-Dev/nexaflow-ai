"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  History,
  Layers,
  RefreshCw,
  Rocket,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { formatDate, formatRelativeTime, cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  MetricCard,
  MetricGrid,
  StatusBadge,
} from "@/components/admin";
import { Modal, useToast } from "@/components/ui";

type DeployOverviewResponse = {
  environment: string;
  isOnline: boolean;
  status: "UP_TO_DATE" | "UPDATE_AVAILABLE" | "DEPLOYING" | "UNKNOWN";
  currentCommit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    deployedAt: string | null;
    deployedBy: string | null;
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
    repo: string;
    branch: string;
    error?: string;
  };
  easyPanel: {
    connected: boolean;
    projectName: string;
    serviceName: string;
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

function deployStatusLabel(st: string): string {
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
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<HistoryItem | null>(null);
  const [selectedLogsId, setSelectedLogsId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // 1. Status geral de deploy (re-polled a cada 5s quando houver deploy ativo)
  const overviewQuery = useQuery({
    queryKey: ["admin-deploy-status"],
    queryFn: () => api<DeployOverviewResponse>("/admin/deploy/status"),
    enabled: user?.platformRole === "SUPERADMIN",
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.activeDeployment ? 4000 : 20000;
    },
  });

  // 2. Histórico de deploys
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

  // 3. Detalhe / Logs de um deploy selecionado
  const detailQuery = useQuery({
    queryKey: ["admin-deploy-detail", selectedLogsId],
    queryFn: () => api<DeploymentDetail>(`/admin/deploy/${selectedLogsId}`),
    enabled: Boolean(selectedLogsId) && user?.platformRole === "SUPERADMIN",
    refetchInterval: () =>
      overviewQuery.data?.activeDeployment?.id === selectedLogsId ? 3000 : false,
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
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      toast({
        title: "Deploy iniciado",
        description: "O processo de build e validação foi enviado ao EasyPanel.",
        kind: "success",
      });
      setSelectedLogsId(res.deploymentId);
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
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      toast({
        title: "Rollback iniciado",
        description: "Reimplantando a versão anterior selecionada.",
        kind: "success",
      });
      setSelectedLogsId(res.deploymentId);
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
  const current = data?.currentCommit ?? null;
  const latest = data?.latestGitHubCommit ?? null;
  const active = data?.activeDeployment ?? null;
  const isUpToDate = data?.status === "UP_TO_DATE";
  const isUpdateAvailable = data?.status === "UPDATE_AVAILABLE";
  const historyItems = historyQuery.data?.items || [];
  const totalPages = historyQuery.data?.totalPages || 1;

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <AdminPageHeader
        title="Deploy"
        description="Controle as versões implantadas em produção com integração direta GitHub → EasyPanel."
        actions={
          <button
            type="button"
            className="admin-btn-ghost h-9 text-[12.5px]"
            onClick={() => {
              void overviewQuery.refetch();
              void historyQuery.refetch();
              toast({ title: "Sincronizado", description: "Dados atualizados do GitHub e EasyPanel.", kind: "success" });
            }}
            disabled={overviewQuery.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", overviewQuery.isFetching && "animate-spin")} />
            Atualizar status
          </button>
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
              : current?.author || "Versão inicial"
          }
          icon={<GitCommit className="h-4 w-4" />}
          tone="brand"
          compact
        />
        <MetricCard
          label="Repositório GitHub"
          value={data?.gitHub?.branch ?? "main"}
          hint={data?.gitHub?.connected ? data.gitHub.repo : data?.gitHub?.error || "Desconectado"}
          icon={<GitBranch className="h-4 w-4" />}
          tone={data?.gitHub?.connected ? "neutral" : "danger"}
          compact
        />
        <MetricCard
          label="EasyPanel"
          value={data?.easyPanel?.connected ? "Conectado" : "Erro"}
          hint={
            data?.easyPanel?.connected
              ? `Serviço ${data.easyPanel.serviceName}`
              : data?.easyPanel?.error || "Indisponível"
          }
          icon={<Layers className="h-4 w-4" />}
          tone={data?.easyPanel?.connected ? "success" : "danger"}
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
              onClick={() => setSelectedLogsId(active.id)}
            >
              <Terminal className="h-3.5 w-3.5" /> Ver logs em tempo real
            </button>
          </div>
        </div>
      ) : null}

      {/* 4. Card de Ação Principal: Comparativo de Versão */}
      <AdminSection
        title="Status da Versão"
        description="Comparação em tempo real entre a versão atual e a branch principal no GitHub."
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
                  <span className="truncate text-[13px] font-medium text-gray-200">
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
                  Último no GitHub ({data?.gitHub?.branch ?? "main"})
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="rounded bg-white/[0.08] px-2 py-0.5 font-mono text-[13px] font-bold text-emerald-300">
                    {latest ? latest.shortSha : "—"}
                  </code>
                  <span className="truncate text-[13px] font-medium text-gray-200">
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
              ) : null}

              <button
                type="button"
                className={cn(
                  "h-10 px-5 text-[13px] font-semibold",
                  isUpdateAvailable ? "admin-btn-primary" : "admin-btn-secondary"
                )}
                disabled={Boolean(active) || startDeployMut.isPending || !data?.easyPanel?.connected}
                onClick={() => setConfirmOpen(true)}
              >
                <Rocket className="h-4 w-4" />
                {isUpdateAvailable ? "Implantar nova versão" : "Reimplantar versão atual"}
              </button>
            </div>
          </div>
        </div>
      </AdminSection>

      {/* 5. Histórico de Implantações */}
      <AdminSection
        title="Histórico de Deploys"
        description="Registro auditável de todas as implantações, durações e validações de saúde."
        flush
      >
        {historyItems.length === 0 ? (
          <AdminEmptyState
            icon={<History className="h-5 w-5" strokeWidth={1.5} />}
            title="Nenhum deploy registrado"
            description="O histórico de implantações aparecerá aqui assim que o primeiro deploy for concluído."
          />
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
                          <p className="max-w-xs truncate text-[13px] font-medium text-gray-200">
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
                              onClick={() => setSelectedLogsId(item.id)}
                            >
                              <Terminal className="h-3.5 w-3.5" /> Logs
                            </button>

                            {item.status === "COMPLETED" && !isItemCurrent && !active ? (
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
        onClose={() => setConfirmOpen(false)}
        title="Implantar em produção?"
        description="Confirme o disparo da nova versão para o ambiente de produção."
        size="md"
        footer={
          <div className="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className="admin-btn-ghost h-9"
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9"
              disabled={startDeployMut.isPending}
              onClick={() => startDeployMut.mutate({})}
            >
              {startDeployMut.isPending ? "Iniciando deploy…" : "Iniciar deploy"}
            </button>
          </div>
        }
      >
        <div className="space-y-3.5 py-1 text-[13px]">
          <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3.5 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Versão:</span>
              <code className="font-mono font-bold text-violet-300">
                {latest ? latest.shortSha : "main"}
              </code>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Branch:</span>
              <span className="font-medium text-white">{data?.gitHub?.branch ?? "main"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Commit:</span>
              <span className="max-w-[240px] truncate text-right font-medium text-white">
                {latest ? latest.message : "Última versão"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/[0.08] p-3 text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <p className="text-[12px] leading-relaxed">
              O NexaFlow iniciará o build automatizado no EasyPanel, atualizará os containers de API e Web e verificará os endpoints de saúde pós-deploy.
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
          <div className="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className="admin-btn-ghost h-9"
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
          </div>
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
            </div>
            <p className="text-[12px] text-gray-300">
              Esta ação gerará uma nova implantação no histórico e validará a integridade do sistema.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* MODAL 3: Visualizador de Logs */}
      <Modal
        open={Boolean(selectedLogsId)}
        onClose={() => setSelectedLogsId(null)}
        title="Logs de Implantação"
        description={
          detailQuery.data
            ? `Deploy ${detailQuery.data.commitShortSha} — ${deployStatusLabel(detailQuery.data.status)}`
            : "Carregando logs…"
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
              onClick={() => setSelectedLogsId(null)}
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="rounded-xl border border-white/[0.08] bg-[#07080a] p-4 text-[12px]">
          {detailQuery.isLoading ? (
            <p className="text-gray-500 font-mono">Carregando logs do deploy…</p>
          ) : detailQuery.data?.logs ? (
            <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap font-mono text-emerald-400 leading-relaxed scrollbar-thin">
              {detailQuery.data.logs}
            </pre>
          ) : (
            <p className="text-gray-500 font-mono">Nenhum log registrado para este deploy.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
