"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollText, Search, Trash2 } from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatDate } from "@/lib/utils";
import { humanizeAuditAction, formatAuditIp } from "@/lib/audit-labels";
import {
  ConsequenceBanner,
  DialogFooter,
  EmptyState,
  EntitySummary,
  FormField,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { AdminPageHeader } from "../admin-page-header";

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
  const secretKey = /secret|password|token|hash|backup|totp|authorization/i;
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

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: () => api<LogsPage>("/admin/logs?take=50"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 30_000,
  });

  // Nova primeira página (load / invalidate) → limpa páginas extras
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
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <EmptyState
        title="Não foi possível carregar auditoria"
        description="Tente novamente em instantes."
      />
    );
  }

  const meta = detail ? sanitizeMetadata(detail.metadata) : null;
  const totalLoaded = allLogs.length;
  const canClear = clearConfirm.trim().toUpperCase() === "LIMPAR";

  return (
    <div>
      <AdminPageHeader
        title="Auditoria"
        actions={
          <button
            type="button"
            className="btn-secondary h-9 gap-1.5 px-3 text-[12px] text-rose-700 hover:border-rose-500/30 hover:bg-rose-500/[0.06] dark:text-rose-300"
            disabled={totalLoaded === 0}
            onClick={() => {
              setClearConfirm("");
              setClearOpen(true);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Limpar logs
          </button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            className="input h-9 pl-8 text-sm"
            placeholder="Buscar evento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-auto min-w-[9rem]"
          size="sm"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "ALL", label: "Todos os tipos" },
            { value: "auth.", label: "Autenticação" },
            { value: "admin.", label: "Admin" },
            { value: "company.", label: "Empresa" },
            { value: "plan.", label: "Planos" },
          ]}
          aria-label="Tipo de evento"
        />
        <span className="text-[12px] text-ink-faint">
          {filtered.length} evento{filtered.length === 1 ? "" : "s"}
          {cursor ? " · mais disponíveis" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<ScrollText className="h-5 w-5" strokeWidth={1.5} />}
          title="Nenhum evento"

        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, logs]) => (
            <section key={key}>
              <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {dayLabel(key)}
              </h2>
              <ul className="overflow-hidden rounded-2xl border border-black/[0.05] dark:border-white/[0.06]">
                {logs.map((log, i) => (
                  <li
                    key={log.id}
                    className={
                      i > 0
                        ? "flex items-center gap-3 border-t border-line-soft px-3.5 py-2 dark:border-white/[0.05]"
                        : "flex items-center gap-3 px-3.5 py-2"
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink dark:text-white">
                        {humanizeAuditAction(log.action)}
                      </p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {log.user?.name || log.user?.email || "Sistema"}
                        {log.tenant ? ` · ${log.tenant.name}` : ""}
                        {" · "}
                        {formatDate(log.createdAt)}
                        {log.ip ? ` · ${formatAuditIp(log.ip)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => setDetail(log)}
                    >
                      Detalhes
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {cursor ? (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                className="btn-secondary h-9 px-4 text-[12px]"
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
              className="btn-secondary h-9 px-3.5"
              onClick={() => setDetail(null)}
            >
              Fechar
            </button>
          </DialogFooter>
        }
      >
        {detail && (
          <div className="space-y-4">
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
                Ator: <span className="font-medium text-ink dark:text-white">{detail.user.email}</span>
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
              className="btn-secondary h-9 px-3.5"
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
            label='Digite LIMPAR para confirmar'
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
