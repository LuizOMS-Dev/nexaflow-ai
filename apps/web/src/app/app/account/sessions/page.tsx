"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Laptop,
  LogOut,
  Smartphone,
  Tablet,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Modal, Spinner, useToast } from "@/components/ui";
import { AccountCard } from "../account-ui";

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

function formatHumanActivity(iso: string) {
  try {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    if (isToday) return `Hoje, ${time}`;
    if (isYesterday) return `Ontem, ${time}`;
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function parseDeviceInfo(label: string | null, ua: string | null) {
  const source = `${ua || ""} ${label || ""}`.trim();
  let icon = Laptop;
  let typeLabel = "Desktop";
  let browser: string | null = null;
  let os: string | null = null;

  if (/ipad|tablet/i.test(source)) {
    icon = Tablet;
    typeLabel = "Tablet";
  } else if (/iphone|android|mobile/i.test(source)) {
    icon = Smartphone;
    typeLabel = "Smartphone";
  }

  // 1. Detecção rigorosa de Browser por ordem de precedência
  if (/OPR\/|Opera/i.test(source)) {
    browser = "Opera";
  } else if (/Edg\//i.test(source)) {
    browser = "Edge";
  } else if (/SamsungBrowser/i.test(source)) {
    browser = "Samsung Internet";
  } else if (/Brave/i.test(source)) {
    browser = "Brave";
  } else if (/Firefox\/|FxiOS\//i.test(source)) {
    browser = "Firefox";
  } else if (/Chrome\/|Chromium\/|CriOS\//i.test(source)) {
    browser = "Chrome";
  } else if (/Safari/i.test(source) && !/Chrome|Android/i.test(source)) {
    browser = "Safari";
  }

  // 2. Detecção de Sistema Operacional
  if (/Windows NT|Windows/i.test(source)) {
    os = "Windows";
  } else if (/Macintosh|Mac OS X/i.test(source)) {
    os = "macOS";
  } else if (/Android/i.test(source)) {
    os = "Android";
  } else if (/iPhone|iPod/i.test(source)) {
    os = "iOS";
  } else if (/iPad/i.test(source)) {
    os = "iPadOS";
  } else if (/CrOS/i.test(source)) {
    os = "ChromeOS";
  } else if (/Linux/i.test(source)) {
    os = "Linux";
  }

  let displayTitle = "";
  if (browser && os) {
    displayTitle = `${browser} · ${os}`;
  } else if (browser) {
    displayTitle = `${browser} · ${typeLabel}`;
  } else if (os) {
    displayTitle = `${typeLabel} · ${os}`;
  } else if (
    label &&
    !/^(desktop|mobile|tablet|unknown|desconhecido|generic|dispositivo desconhecido|navegador web|sistema operacional)$/i.test(
      label.trim()
    )
  ) {
    displayTitle = label;
  } else {
    displayTitle = typeLabel;
  }

  return {
    Icon: icon,
    displayTitle,
  };
}

export default function AccountSessionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmRevokeOthersOpen, setConfirmRevokeOthersOpen] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<SessionRow | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: () => api<SessionsResponse>("/auth/sessions"),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSessionToRevoke(null);
      toast({ kind: "success", title: "Sessão encerrada com sucesso." });
      void qc.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Não foi possível encerrar a sessão", description: e.message });
    },
  });

  const revokeOthers = useMutation({
    mutationFn: () => api("/auth/sessions/revoke-others", { method: "POST" }),
    onSuccess: () => {
      setConfirmRevokeOthersOpen(false);
      toast({
        kind: "success",
        title: "Todas as outras sessões foram encerradas com sucesso.",
      });
      void qc.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Não foi possível encerrar as sessões", description: e.message });
    },
  });

  const list = sessionsQuery.data?.sessions || [];
  const otherCount = list.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6">
      <AccountCard
        title="Dispositivos e sessões conectadas"
        description="Gerencie os dispositivos com acesso ativo à sua conta."
        flush
        action={
          otherCount > 0 ? (
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
              onClick={() => setConfirmRevokeOthersOpen(true)}
            >
              Encerrar outras sessões ({otherCount})
            </button>
          ) : null
        }
      >
        <div>
          {sessionsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-xs text-ink-muted dark:text-zinc-400">
              Nenhuma sessão ativa encontrada.
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {list.map((s) => {
                const { Icon, displayTitle } = parseDeviceInfo(s.deviceLabel, s.userAgent);
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors",
                      list.length === 1 ? "p-4 sm:px-5 sm:py-4" : "p-5 sm:px-6",
                      s.isCurrent
                        ? "bg-violet-500/[0.02] dark:bg-violet-500/[0.03]"
                        : "hover:bg-black/[0.01] dark:hover:bg-white/[0.015]"
                    )}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.03] text-zinc-600 dark:bg-white/[0.05] dark:text-zinc-300 shadow-xs">
                        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13.5px] font-semibold text-ink dark:text-white truncate">
                            {displayTitle}
                          </p>
                          {s.isCurrent ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Este dispositivo
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-muted dark:text-zinc-400">
                          {s.ip ? <span>IP {s.ip}</span> : null}
                          {s.ip ? <span>·</span> : null}
                          <span>Atividade: {formatHumanActivity(s.lastActivityAt)}</span>
                        </div>
                      </div>
                    </div>

                    {!s.isCurrent ? (
                      <div className="shrink-0 self-start sm:self-center">
                        <button
                          type="button"
                          className="btn-secondary h-8 px-3 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 gap-1.5 border-rose-500/20"
                          disabled={revokeOne.isPending}
                          onClick={() => setSessionToRevoke(s)}
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Encerrar</span>
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AccountCard>

      {/* ── Modal de Confirmação para Encerrar Sessão Única ── */}
      <Modal
        open={Boolean(sessionToRevoke)}
        onClose={() => setSessionToRevoke(null)}
        title="Encerrar sessão?"
      >
        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <p className="leading-relaxed">
            Isso desconectará o dispositivo selecionado ({sessionToRevoke ? parseDeviceInfo(sessionToRevoke.deviceLabel, sessionToRevoke.userAgent).displayTitle : ""}). O usuário precisará fazer login novamente.
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs font-medium"
              onClick={() => setSessionToRevoke(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-red-600 hover:bg-red-700 text-white"
              disabled={revokeOne.isPending}
              onClick={() => sessionToRevoke && revokeOne.mutate(sessionToRevoke.id)}
            >
              {revokeOne.isPending ? "Encerrando…" : "Encerrar sessão"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal de Confirmação para Encerrar Outras Sessões ── */}
      <Modal
        open={confirmRevokeOthersOpen}
        onClose={() => setConfirmRevokeOthersOpen(false)}
        title="Encerrar outras sessões?"
      >
        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <p className="leading-relaxed">
            Isso desconectará sua conta de todos os outros navegadores e dispositivos conectados.
            Apenas este dispositivo atual permanecerá conectado.
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs font-medium"
              onClick={() => setConfirmRevokeOthersOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-red-600 hover:bg-red-700 text-white"
              disabled={revokeOthers.isPending}
              onClick={() => revokeOthers.mutate()}
            >
              {revokeOthers.isPending ? "Encerrando…" : "Confirmar e desconectar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
