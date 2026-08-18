"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ScrollText,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Copy,
  Check,
  FilterX,
  Clock,
  User,
  Building2,
  Globe,
  Terminal,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import {
  humanizeAuditAction,
  formatAuditIp,
  auditSeverity,
  formatAuditDate,
  auditCategoryLabel,
} from "@/lib/audit-labels";
import {
  Checkbox,
  DialogFooter,
  Modal,
  useToast,
} from "@/components/ui";
import {
  AdminErrorState,
  AdminFilterBar,
  AdminPageHeader,
  AdminSearchInput,
  AdminSection,
  AdminSelectFilter,
  AdminSkeleton,
  CriticalActionDialog,
  StatusBadge,
} from "@/components/admin";

type AuditLog = {
  id: string;
  action: string;
  category?: string;
  severity?: "SUCCESS" | "INFO" | "WARNING" | "FAIL" | "CRITICAL";
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
  user?: { id: string; name: string; email: string } | null;
  tenant?: { id: string; name: string } | null;
};

type LogsPage = {
  items: AuditLog[];
  nextCursor: string | null;
  count?: number;
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const tKey = dayKey(today.toISOString());
  const yKey = dayKey(yest.toISOString());
  if (key === tKey) return "Hoje";
  if (key === yKey) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

export default function AdminAuditPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Estados de navegação e filtros
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  // Modal de limpeza com confirmação dupla
  const [clearOpen, setClearOpen] = useState(false);
  const [clearAgree, setClearAgree] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");

  // Paginação por cursor
  const [extraItems, setExtraItems] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce da busca (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Montagem da query string server-side
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("take", "50");
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (typeFilter !== "ALL") params.set("category", typeFilter);
    if (severityFilter !== "ALL") params.set("severity", severityFilter);
    return `/admin/logs?${params.toString()}`;
  }, [debouncedSearch, typeFilter, severityFilter]);

  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["admin-logs", debouncedSearch, typeFilter, severityFilter],
    queryFn: () => api<LogsPage>(queryUrl),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 30_000,
  });

  // Reseta itens extras ao atualizar ou alterar filtros
  useEffect(() => {
    setExtraItems([]);
    setCursor(data?.nextCursor ?? null);
  }, [dataUpdatedAt, data?.nextCursor]);

  // Mutação de Limpeza do Histórico com Confirmação Dupla
  const clearMutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; deleted: number; message: string }>("/admin/logs", {
        method: "DELETE",
        json: { confirm: clearConfirm.trim() },
      }),
    onSuccess: (res) => {
      setExtraItems([]);
      setCursor(null);
      void qc.invalidateQueries({ queryKey: ["admin-logs"] });
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
      setClearOpen(false);
      setClearAgree(false);
      setClearConfirm("");
      toast({
        kind: "success",
        title: "Histórico de auditoria limpo",
        description: res.message,
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível limpar", description: e.message }),
  });

  // Carregamento incremental da próxima página
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("take", "50");
      params.set("cursor", cursor);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (typeFilter !== "ALL") params.set("category", typeFilter);
      if (severityFilter !== "ALL") params.set("severity", severityFilter);

      const page = await api<LogsPage>(`/admin/logs?${params.toString()}`);
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      toast({
        kind: "error",
        title: "Falha ao carregar mais eventos",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, debouncedSearch, typeFilter, severityFilter, toast]);

  // Lista consolidada de eventos
  const allLogs = useMemo(
    () => [...(data?.items ?? []), ...extraItems],
    [data?.items, extraItems]
  );

  // Agrupamento temporal (Hoje, Ontem, Datas anteriores)
  const grouped = useMemo(() => {
    const map = new Map<string, AuditLog[]>();
    for (const log of allLogs) {
      const k = dayKey(log.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(log);
    }
    return Array.from(map.entries());
  }, [allLogs]);

  // Copiar detalhes técnicos em JSON sanitizado
  const handleCopyDetails = useCallback(async () => {
    if (!detail) return;
    try {
      const payload = {
        id: detail.id,
        action: detail.action,
        severity: detail.severity || auditSeverity(detail.action).label,
        category: detail.category,
        entity: detail.entity,
        entityId: detail.entityId,
        createdAt: detail.createdAt,
        actor: detail.user ? `${detail.user.name} (${detail.user.email})` : "Sistema",
        ip: detail.ip,
        tenant: detail.tenant?.name || "Plataforma",
        metadata: detail.metadata || {},
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ kind: "success", title: "Copiado", description: "Detalhes do evento copiados para a área de transferência." });
    } catch {
      toast({ kind: "error", title: "Erro ao copiar", description: "Não foi possível acessar a área de transferência." });
    }
  }, [detail, toast]);

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando auditoria">
        <div className="space-y-2">
          <AdminSkeleton className="h-8 w-40" />
          <AdminSkeleton className="h-3 w-72" />
        </div>
        <AdminSkeleton className="h-12 rounded-xl" />
        <AdminSkeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar a auditoria"
        description="Verifique sua conexão ou tente novamente em instantes."
        onRetry={() => void refetch()}
      />
    );
  }

  const totalLoaded = allLogs.length;
  const isExactConfirm = clearConfirm.trim().toUpperCase() === "LIMPAR AUDITORIA";
  const canSubmitClear = clearAgree && isExactConfirm;

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <AdminPageHeader
        title="Auditoria"
        description="Trilha de auditoria administrativa, segurança e ciclo de vida da plataforma."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="admin-btn-secondary gap-1.5"
              disabled={isFetching}
              onClick={() => void refetch()}
              aria-label="Atualizar lista de auditoria"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-amber-400" : ""}`}
                strokeWidth={1.75}
              />
              <span>{isFetching ? "Atualizando…" : "Atualizar"}</span>
            </button>
            <button
              type="button"
              className="admin-btn-secondary text-rose-300/90 hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
              disabled={totalLoaded === 0}
              onClick={() => {
                setClearAgree(false);
                setClearConfirm("");
                setClearOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Limpar histórico
            </button>
          </div>
        }
      />

      {/* Barra Compacta de Filtros */}
      <AdminFilterBar>
        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar evento, ator, e-mail, empresa, IP…"
        />
        <AdminSelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          label="Tipo"
          options={[
            { value: "ALL", label: "Todos os tipos" },
            { value: "AUTH", label: "Autenticação" },
            { value: "ADMIN", label: "Administração" },
            { value: "COMPANY", label: "Empresas" },
            { value: "PLAN", label: "Planos" },
            { value: "FINANCE", label: "Financeiro" },
            { value: "DEPLOY", label: "Deploy" },
            { value: "GITHUB", label: "GitHub" },
            { value: "EASYPANEL", label: "EasyPanel" },
            { value: "SECURITY", label: "Segurança" },
          ]}
        />
        <AdminSelectFilter
          value={severityFilter}
          onChange={setSeverityFilter}
          label="Severidade"
          options={[
            { value: "ALL", label: "Todas as severidades" },
            { value: "SUCCESS", label: "Sucesso" },
            { value: "INFO", label: "Informação" },
            { value: "WARNING", label: "Atenção" },
            { value: "FAIL", label: "Falha" },
            { value: "CRITICAL", label: "Crítico" },
          ]}
        />
        <span className="text-[12px] tabular-nums text-gray-500 sm:ml-auto">
          {totalLoaded} evento{totalLoaded === 1 ? "" : "s"} carregado{totalLoaded === 1 ? "" : "s"}
          {cursor ? " · mais disponíveis" : ""}
        </span>
      </AdminFilterBar>

      {/* Listagem Vazia */}
      {totalLoaded === 0 ? (
        <AdminSection flush>
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400">
              {debouncedSearch || typeFilter !== "ALL" || severityFilter !== "ALL" ? (
                <FilterX className="h-5 w-5" strokeWidth={1.5} />
              ) : (
                <ScrollText className="h-5 w-5" strokeWidth={1.5} />
              )}
            </div>
            <p className="text-[13.5px] font-semibold text-white/85">
              {debouncedSearch || typeFilter !== "ALL" || severityFilter !== "ALL"
                ? "Nenhum evento encontrado com estes filtros."
                : "Nenhum evento de auditoria registrado"}
            </p>
            <p className="mt-1 max-w-sm text-[12.5px] text-gray-500">
              {debouncedSearch || typeFilter !== "ALL" || severityFilter !== "ALL"
                ? "Tente ajustar os termos de busca, o tipo ou a severidade selecionada."
                : "Novas ações administrativas, logins e operações de sistema serão registradas aqui."}
            </p>
            {(debouncedSearch || typeFilter !== "ALL" || severityFilter !== "ALL") && (
              <button
                type="button"
                className="admin-btn-secondary mt-4 text-[12px]"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("ALL");
                  setSeverityFilter("ALL");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        </AdminSection>
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, logs]) => (
            <AdminSection
              key={key}
              title={dayLabel(key)}
              description={`${logs.length} evento${logs.length === 1 ? "" : "s"}`}
              flush
            >
              {/* Tabela Desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="admin-table w-full min-w-[760px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="w-[120px] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Severidade
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Evento
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Ator
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Empresa
                      </th>
                      <th className="w-[140px] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Quando
                      </th>
                      <th className="w-[100px] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const sev = auditSeverity(log.action, log.severity);
                      return (
                        <tr
                          key={log.id}
                          className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
                        >
                          <td className="px-4 py-2.5 align-middle">
                            <StatusBadge tone={sev.tone} dot>
                              {sev.label}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-2.5 align-middle">
                            <p className="font-medium text-white/90">
                              {humanizeAuditAction(log.action)}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-gray-500">
                              {log.action}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 align-middle text-gray-300">
                            <p className="max-w-[180px] truncate font-medium">
                              {log.user?.name || log.user?.email || "Sistema"}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {formatAuditIp(log.ip)}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 align-middle text-gray-400">
                            {log.tenant?.name || "Plataforma"}
                          </td>
                          <td className="px-4 py-2.5 align-middle tabular-nums text-gray-400 whitespace-nowrap">
                            <time dateTime={log.createdAt} title={new Date(log.createdAt).toLocaleString("pt-BR")}>
                              {formatAuditDate(log.createdAt)}
                            </time>
                          </td>
                          <td className="px-4 py-2.5 align-middle text-right">
                            <button
                              type="button"
                              className="admin-btn-secondary h-8 px-3 text-[12px] font-medium"
                              onClick={() => setDetail(log)}
                            >
                              Detalhes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cards Mobile / Tablet */}
              <div className="block lg:hidden divide-y divide-white/[0.04]">
                {logs.map((log) => {
                  const sev = auditSeverity(log.action, log.severity);
                  return (
                    <div
                      key={log.id}
                      className="p-3.5 sm:p-4 space-y-2.5 transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-[13.5px] text-white/95 truncate">
                            {humanizeAuditAction(log.action)}
                          </p>
                          <p className="font-mono text-[11px] text-gray-500 truncate">
                            {log.action}
                          </p>
                        </div>
                        <StatusBadge tone={sev.tone} dot>
                          {sev.label}
                        </StatusBadge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[12px] text-gray-400 pt-1 border-t border-white/[0.03]">
                        <div>
                          <span className="text-gray-500 block text-[11px]">Ator</span>
                          <span className="truncate block font-medium text-gray-300">
                            {log.user?.name || log.user?.email || "Sistema"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[11px]">Empresa</span>
                          <span className="truncate block text-gray-300">
                            {log.tenant?.name || "Plataforma"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[11px]">IP</span>
                          <span className="text-gray-400">{formatAuditIp(log.ip)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[11px]">Horário</span>
                          <span className="tabular-nums text-gray-400">{formatAuditDate(log.createdAt)}</span>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          className="admin-btn-secondary h-7.5 px-3 text-[11.5px]"
                          onClick={() => setDetail(log)}
                        >
                          Ver detalhes
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </AdminSection>
          ))}

          {/* Botão de Paginação Server-side */}
          {cursor ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className="admin-btn-secondary min-w-[200px]"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Carregando mais eventos…" : "Carregar mais eventos"}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Modal de Detalhes do Evento */}
      <Modal
        open={!!detail}
        onClose={() => {
          setDetail(null);
          setCopied(false);
        }}
        title={detail ? humanizeAuditAction(detail.action) : "Detalhes"}
        icon={<ScrollText className="h-4 w-4" strokeWidth={1.75} />}
        size="md"
        variant="detail"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-3.5 gap-1.5"
              onClick={handleCopyDetails}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                  <span>Copiar detalhes</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4"
              onClick={() => setDetail(null)}
            >
              Fechar
            </button>
          </DialogFooter>
        }
      >
        {detail && (
          <div className="space-y-4">
            {/* Header com badge semântico + código técnico */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <StatusBadge tone={auditSeverity(detail.action, detail.severity).tone} dot>
                  {auditSeverity(detail.action, detail.severity).label}
                </StatusBadge>
                {detail.category && (
                  <span className="rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-gray-400 bg-white/[0.04] border border-white/[0.06]">
                    {auditCategoryLabel(detail.category)}
                  </span>
                )}
              </div>
              <code className="font-mono text-[11px] text-gray-400 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.06]">
                {detail.action}
              </code>
            </div>

            {/* Grid Principal de Informações */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12.5px]">
              <div className="p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] space-y-1">
                <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Data e Horário</span>
                </div>
                <p className="font-medium text-white/90 tabular-nums">
                  {new Date(detail.createdAt).toLocaleString("pt-BR", {
                    dateStyle: "full",
                    timeStyle: "medium",
                  })}
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] space-y-1">
                <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                  <User className="h-3.5 w-3.5" />
                  <span>Ator Responsável</span>
                </div>
                <p className="font-medium text-white/90 truncate">
                  {detail.user?.name || "Sistema"}
                </p>
                {detail.user?.email && (
                  <p className="text-[11px] text-gray-400 truncate">{detail.user.email}</p>
                )}
              </div>

              <div className="p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] space-y-1">
                <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Endereço IP</span>
                </div>
                <p className="font-medium text-white/90">
                  {formatAuditIp(detail.ip)}
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] space-y-1">
                <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Empresa / Escopo</span>
                </div>
                <p className="font-medium text-white/90 truncate">
                  {detail.tenant?.name || "Plataforma"}
                </p>
              </div>
            </div>

            {/* Contextos Especiais (Deployment, GitHub, EasyPanel, etc.) */}
            {detail.metadata && (
              <div className="space-y-2">
                {/* Contexto de Deploy */}
                {Boolean(detail.metadata.sha || detail.metadata.shortSha || detail.metadata.targetSha) && (
                  <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] space-y-1 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400">
                        Contexto da Implantação
                      </span>
                      {Boolean(detail.metadata.status) && (
                        <span className="font-mono text-[11px] text-gray-300">
                          {String(detail.metadata.status)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 pt-1">
                      {Boolean(detail.metadata.sha) && (
                        <div>
                          <span className="text-gray-500 text-[11px] block">Commit SHA:</span>
                          <span className="font-mono text-[11px] text-amber-300">
                            {String(detail.metadata.sha).slice(0, 7)}
                          </span>
                        </div>
                      )}
                      {Boolean(detail.metadata.branch) && (
                        <div>
                          <span className="text-gray-500 text-[11px] block">Branch:</span>
                          <span className="font-mono text-[11px] text-gray-300">
                            {String(detail.metadata.branch)}
                          </span>
                        </div>
                      )}
                      {Boolean(detail.metadata.durationMs) && (
                        <div>
                          <span className="text-gray-500 text-[11px] block">Duração:</span>
                          <span className="tabular-nums text-gray-300">
                            {Number(detail.metadata.durationMs) / 1000}s
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Contexto de Contagem / Limpeza */}
                {Boolean(detail.metadata.deletedCount !== undefined || detail.metadata.count !== undefined) && (
                  <div className="p-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[12px] flex items-center justify-between">
                    <span className="text-gray-400">Registros afetados pela operação:</span>
                    <span className="font-semibold text-emerald-400 tabular-nums">
                      {String(detail.metadata.deletedCount ?? detail.metadata.count)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Detalhes Técnicos e Metadados Sanitizados */}
            <details className="group rounded-xl border border-white/[0.06] bg-black/20">
              <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12.5px] font-medium text-gray-300 marker:content-none hover:text-white flex items-center justify-between [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-gray-400" />
                  Detalhes técnicos e metadados
                </span>
                <span className="text-[11px] font-normal text-gray-500 group-open:hidden">
                  (clique para expandir)
                </span>
              </summary>
              <div className="border-t border-white/[0.06] p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span>ID do Evento: <code className="font-mono text-gray-300">{detail.id}</code></span>
                  {detail.entity && <span>Entidade: <code className="font-mono text-gray-300">{detail.entity}</code></span>}
                </div>
                <pre className="max-h-56 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] font-mono leading-relaxed text-gray-300 border border-white/[0.04]">
                  {JSON.stringify(detail.metadata || {}, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}
      </Modal>

      {/* Modal de Limpeza com Confirmação Dupla Padronizada */}
      <CriticalActionDialog
        open={clearOpen}
        onClose={() => {
          if (clearMutation.isPending) return;
          setClearOpen(false);
          setClearAgree(false);
          setClearConfirm("");
        }}
        title="Limpar histórico de auditoria"
        description="Esta ação removerá da visualização administrativa os eventos selecionados conforme a política de retenção. Registros de segurança que precisam ser preservados continuarão protegidos."
        tone="danger"
        summaryTitle="Impacto da limpeza"
        summaryRows={[
          {
            label: "Remove",
            value: "Histórico administrativo exibido no painel",
            tone: "danger",
          },
          {
            label: "Preserva",
            value: "Registros protegidos de segurança e MFA",
            tone: "success",
          },
          {
            label: "Registra",
            value: "Evento permanente informando quem realizou a limpeza",
            tone: "success",
          },
        ]}
        checkboxLabel="Entendo o impacto desta operação sobre o histórico de auditoria."
        checkboxChecked={clearAgree}
        onCheckboxChange={setClearAgree}
        confirmExpectedText="LIMPAR AUDITORIA"
        confirmInput={clearConfirm}
        onConfirmInputChange={setClearConfirm}
        cancelLabel="Cancelar"
        onCancel={() => {
          if (clearMutation.isPending) return;
          setClearOpen(false);
          setClearAgree(false);
          setClearConfirm("");
        }}
        actionLabel="Limpar histórico"
        actionLoadingLabel="Limpando…"
        isLoading={clearMutation.isPending}
        errorMessage={
          clearMutation.isError
            ? clearMutation.error instanceof Error
              ? clearMutation.error.message
              : "Não foi possível limpar o histórico de auditoria."
            : null
        }
        onAction={() => clearMutation.mutate()}
      />
    </div>
  );
}
