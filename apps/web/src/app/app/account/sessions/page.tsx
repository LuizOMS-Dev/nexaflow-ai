"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Spinner, useToast } from "@/components/ui";

type SessionRow = {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  ip: string | null;
  deviceLabel: string | null;
  userAgent: string | null;
  isCurrent: boolean;
};

type SessionsResponse = {
  currentSessionId: string | null;
  sessions: SessionRow[];
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AccountSessionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const sessions = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: () => api<SessionsResponse>("/auth/sessions"),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ kind: "success", title: "Sessão encerrada" });
      qc.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Não foi possível encerrar", description: e.message });
    },
  });

  const revokeOthers = useMutation({
    mutationFn: () => api("/auth/sessions/revoke-others", { method: "POST" }),
    onSuccess: () => {
      toast({
        kind: "success",
        title: "Outras sessões encerradas",
        description: "Somente este dispositivo permanece conectado.",
      });
      qc.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Não foi possível encerrar", description: e.message });
    },
  });

  const list = sessions.data?.sessions || [];
  const othersCount = list.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
            Sessões
          </h2>
        </div>
        {othersCount > 0 ? (
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0 self-start sm:self-auto"
            disabled={revokeOthers.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Encerrar todas as outras sessões? Você permanecerá conectado apenas neste dispositivo."
                )
              ) {
                revokeOthers.mutate();
              }
            }}
          >
            {revokeOthers.isPending ? "Encerrando…" : "Encerrar outras sessões"}
          </button>
        ) : null}
      </div>

      {sessions.isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {sessions.isError && (
        <div className="card p-6 text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar as sessões. Tente novamente.
        </div>
      )}

      {!sessions.isLoading && !sessions.isError && list.length === 0 && (
        <EmptyState
          title="Nenhuma sessão ativa"

          icon={<MonitorSmartphone className="h-5 w-5" strokeWidth={1.5} />}
        />
      )}

      {list.length > 0 && (
        <div className="card divide-y divide-line-soft overflow-hidden dark:divide-white/[0.05]">
          {list.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-muted dark:bg-white/[0.05]">
                  <MonitorSmartphone className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink dark:text-white">
                      {s.deviceLabel || "Dispositivo"}
                    </p>
                    {s.isCurrent && <span className="badge-brand">Este dispositivo</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Última atividade: {formatWhen(s.lastActivityAt)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    Criada em {formatWhen(s.createdAt)} · expira {formatWhen(s.expiresAt)}
                  </p>
                </div>
              </div>

              {!s.isCurrent && (
                <button
                  type="button"
                  className="btn-ghost btn-sm shrink-0 text-red-600 dark:text-red-400"
                  disabled={revokeOne.isPending}
                  onClick={() => {
                    if (window.confirm("Encerrar esta sessão?")) {
                      revokeOne.mutate(s.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Encerrar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
