"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollText, Trash2 } from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatDate } from "@/lib/utils";
import { humanizeAuditAction, formatAuditIp } from "@/lib/audit-labels";
import {
  ConsequenceBanner,
  DialogFooter,
  EntitySummary,
  FormField,
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
  StatusBadge,
  type AdminTone,
} from "@/components/admin";

type AuditLog = {
  id: string;
  action: string;
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
};

function sanitizeMetadata(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const out: Record<string, unknown> = {};
  const secretKey = /secret|password|token|hash|backup|totp|authorization|api[_-]?key|credential/i;
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (secretKey.test(k)) {
      out[k] = "[omitido]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

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
  });
}

/** Severity visual from action name — audit API has no severity field */
function auditSeverity(action: string): { tone: AdminTone; label: string } {
  const a = (action || "").toLowerCase();
  if (
    /failed|blocked|delete|suspend|denied|revoked|cancelled|canceled|disabled/.test(a)
  ) {
    return { tone: "danger", label: "Crítico" };
  }
  if (
    /impersonate|cleared|password\.|mfa\.disabled|deletion|archive|warning/.test(a)
  ) {
    return { tone: "warning", label: "Atenção" };
  }
  if (/login$|create|enabled|verified|reactivated|unblocked|completed|paid/.test(a)) {
    return { tone: "success", label: "OK" };
  }
  if (a.startsWith("auth.")) return { tone: "info", label: "Auth" };
  if (a.startsWith("admin.")) return { tone: "violet", label: "Admin" };
  return { tone: "neutral", label: "Info" };
}

export default function AdminAuditPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");
  const [extraItems, setExtraItems] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: () => api<LogsPage>("/admin/logs?take=50"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 30_000,
  });

  useEffect(() => {
    setExtraItems([]);
    setCursor(data?.nextCursor ?? null);
  }, [dataUpdatedAt, data?.nextCursor]);

  const clearMutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; deleted: number; message: string }>("/admin/logs", {
        method: "DELETE",
        json: { confirm: clearConfirm.trim(), all: true },
      }),
    onSuccess: (res) => {
      setExtraItems([]);
      setCursor(null);
      void qc.invalidateQueries({ queryKey: ["admin-logs"] });
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
      setClearOpen(false);
      setClearConfirm("");
      toast({
        kind: "success",
        title: "Logs limpos",
        description: res.message,
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível limpar", description: e.message }),
  });

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<LogsPage>(
        `/admin/logs?take=50&cursor=${encodeURIComponent(cursor)}`
      );
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      toast({
        kind: "error",
        title: "Falha ao carregar mais",
        description: e instanceof Error ? e.message : "Erro",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, toast]);

  const allLogs = useMemo(
    () => [...(data?.items ?? []), ...extraItems],
    [data?.items, extraItems]
  );

  const filtered = useMemo(() => {
    let logs = allLogs;
    if (typeFilter !== "ALL") {
      logs = logs.filter((l) => l.action.startsWith(typeFilter));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      logs = logs.filter((l) => {
        const hay = [
          l.action,
          humanizeAuditAction(l.action),
          l.user?.name,
          l.user?.email,
          l.tenant?.name,
          l.entity,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return logs;
  }, [allLogs, search, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, AuditLog[]>();
    for (const log of filtered) {
      const k = dayKey(log.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(log);
    }
    return Array.from(map.entries());
  }, [filtered]);

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
        title="Não foi possível carregar auditoria"
        description="Tente novamente em instantes."
        onRetry={() => void refetch()}
      />
    );
  }

  const meta = detail ? sanitizeMetadata(detail.metadata) : null;
  const totalLoaded = allLogs.length;
  const canClear = clearConfirm.trim().toUpperCase() === "LIMPAR";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Auditoria"
        description="Trilha de eventos operacionais — logins, admin, empresas e planos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? "Atualizando…" : "Atualizar"}
            </button>
            <button
              type="button"
              className="admin-btn-secondary text-red-300/90 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200"
              disabled={totalLoaded === 0}
              onClick={() => {
                setClearConfirm("");
                setClearOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Limpar logs
            </button>
          </div>
        }
      />

      <AdminFilterBar>
        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar evento, ator, empresa…"
        />
        <AdminSelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          label="Tipo"
          options={[
            { value: "ALL", label: "Todos os tipos" },
            { value: "auth.", label: "Autenticação" },
            { value: "admin.", label: "Admin" },
            { value: "company.", label: "Empresa" },
            { value: "plan.", label: "Planos" },
          ]}
        />
        <span className="text-[12px] tabular-nums text-gray-500 sm:ml-auto">
          {filtered.length} de {totalLoaded} carregado{totalLoaded === 1 ? "" : "s"}
          {cursor ? " · mais disponíveis" : ""}
        </span>
      </AdminFilterBar>

      {filtered.length === 0 ? (
        <AdminSection flush>
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400">
              <ScrollText className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="text-[13.5px] font-semibold text-white/85">Nenhum evento</p>
            <p className="mt-1 max-w-sm text-[12.5px] text-gray-500">
              Ajuste os filtros ou aguarde novas ações na plataforma.
            </p>
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
              <div className="admin-table-wrap overflow-x-auto">
                <table className="admin-table w-full min-w-[720px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
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
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Quando
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                       {" "}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const sev = auditSeverity(log.action);
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
                            <p className="mt-0.5 font-mono text-[11px] text-gray-600">
                              {log.action}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 align-middle text-gray-300">
                            <p className="truncate max-w-[160px]">
                              {log.user?.name || log.user?.email || "Sistema"}
                            </p>
                            {log.ip ? (
                              <p className="text-[11px] text-gray-600">
                                {formatAuditIp(log.ip)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-gray-400">
                            {log.tenant?.name || "—"}
                          </td>
                          <td className="px-4 py-2.5 align-middle tabular-nums text-gray-400">
                            {formatDate(log.createdAt)}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-right">
                            <button
                              type="button"
                              className="admin-btn-ghost h-8 px-2.5 text-[12px]"
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
            </AdminSection>
          ))}

          {cursor ? (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Carregando…" : "Carregar mais eventos"}
              </button>
            </div>
          ) : null}
        </div>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? humanizeAuditAction(detail.action) : "Detalhes"}
        icon={<ScrollText className="h-4 w-4" strokeWidth={1.75} />}
        size="md"
        variant="detail"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-3.5"
              onClick={() => setDetail(null)}
            >
              Fechar
            </button>
          </DialogFooter>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={auditSeverity(detail.action).tone} dot>
                {auditSeverity(detail.action).label}
              </StatusBadge>
            </div>
            <EntitySummary
              title={humanizeAuditAction(detail.action)}
              subtitle={detail.user?.name || "Sistema"}
              meta={[
                {
                  label: "Data",
                  value: formatDate(detail.createdAt),
                },
                {
                  label: "IP",
                  value: formatAuditIp(detail.ip),
                },
                {
                  label: "Empresa",
                  value: detail.tenant?.name || "—",
                },
              ]}
            />
            {detail.user?.email ? (
              <p className="text-[12px] text-ink-muted">
                Ator:{" "}
                <span className="font-medium text-ink dark:text-white">
                  {detail.user.email}
                </span>
              </p>
            ) : null}
            {meta && Object.keys(meta).length > 0 ? (
              <details className="group rounded-xl border border-black/[0.05] dark:border-white/[0.06]">
                <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12.5px] font-medium text-ink-secondary marker:content-none dark:text-gray-200 [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-1.5">
                    Detalhes técnicos
                    <span className="text-[11px] font-normal text-ink-faint group-open:hidden">
                      (expandir)
                    </span>
                  </span>
                </summary>
                <div className="border-t border-black/[0.05] px-3.5 py-2.5 dark:border-white/[0.06]">
                  <p className="mb-2 font-mono text-[11px] text-ink-faint">{detail.action}</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-black/[0.03] p-3 text-[11px] leading-relaxed text-ink-secondary dark:bg-white/[0.04] dark:text-gray-300">
                    {JSON.stringify(meta, null, 2)}
                  </pre>
                </div>
              </details>
            ) : (
              <p className="font-mono text-[11px] text-ink-faint">{detail.action}</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={clearOpen}
        onClose={() => {
          if (clearMutation.isPending) return;
          setClearOpen(false);
          setClearConfirm("");
        }}
        title="Limpar logs de auditoria?"
        description="Remove o histórico de eventos da plataforma. Esta ação não pode ser desfeita."
        variant="danger"
        tone="danger"
        icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} />}
        size="sm"
        preventClose={clearMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-3.5"
              disabled={clearMutation.isPending}
              onClick={() => {
                setClearOpen(false);
                setClearConfirm("");
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger h-9 px-4"
              disabled={clearMutation.isPending || !canClear}
              onClick={() => clearMutation.mutate()}
            >
              {clearMutation.isPending ? "Limpando…" : "Limpar todos os logs"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          <ConsequenceBanner tone="danger">
            Serão removidos todos os registros de auditoria (login, admin, empresas,
            planos, etc.). Um único evento residual será gravado informando quem limpou e
            quantos registros existiam.
          </ConsequenceBanner>
          <FormField
            label="Digite LIMPAR para confirmar"
            required
            hint="A confirmação não diferencia maiúsculas e minúsculas."
          >
            <input
              className="input"
              value={clearConfirm}
              onChange={(e) => setClearConfirm(e.target.value)}
              placeholder="LIMPAR"
              autoComplete="off"
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
