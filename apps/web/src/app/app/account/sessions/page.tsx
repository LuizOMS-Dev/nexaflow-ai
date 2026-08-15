"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone, Smartphone, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Spinner, useToast } from "@/components/ui";
import { AccountPanel, AccountPanelHead } from "../account-ui";
import { cn } from "@/lib/utils";

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

function isMobileLabel(label: string | null) {
  if (!label) return false;
  return /mobile|android|iphone|ipad/i.test(label);
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
    <AccountPanel>
      <AccountPanelHead
        title="Dispositivos conectados"
        action={
          othersCount > 0 ? (
            <button
              type="button"
              className="btn-secondary h-8 px-2.5 text-[12px]"
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
              {revokeOthers.isPending ? "Encerrando…" : "Encerrar outras"}
            </button>
          ) : undefined
        }
      />

      <div className="px-1 py-1 sm:px-2">
        {sessions.isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {sessions.isError && (
          <p className="px-3 py-6 text-center text-sm text-red-600 dark:text-red-400">
            Não foi possível carregar as sessões.
          </p>
        )}

        {!sessions.isLoading && !sessions.isError && list.length === 0 && (
          <div className="py-8">
            <EmptyState
              title="Nenhuma sessão ativa"
              icon={<MonitorSmartphone className="h-5 w-5" strokeWidth={1.5} />}
            />
          </div>
        )}

        {list.length > 0 && (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {list.map((s) => {
              const Icon = isMobileLabel(s.deviceLabel) ? Smartphone : MonitorSmartphone;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between rounded-xl transition-colors",
                    s.isCurrent && "bg-indigo-500/[0.06] dark:bg-white/[0.04]"
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-ink-secondary dark:bg-white/[0.06] dark:text-zinc-300">
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-semibold text-ink dark:text-white">
                          {s.deviceLabel || "Dispositivo"}
                        </p>
                        {s.isCurrent ? (
                          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-700 dark:text-indigo-300">
                            Este dispositivo
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-muted dark:text-zinc-400">
                        Última atividade {formatWhen(s.lastActivityAt)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-faint dark:text-zinc-500">
                        Criada {formatWhen(s.createdAt)}
                        {s.ip ? (
                          <span className="text-ink-faint/80"> · IP {s.ip}</span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {!s.isCurrent ? (
                    <button
                      type="button"
                      className="btn-ghost h-8 shrink-0 self-start px-2.5 text-[12px] text-red-600 dark:text-red-400 sm:self-auto"
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
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AccountPanel>
  );
}
