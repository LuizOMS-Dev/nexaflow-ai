"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Laptop,
  LogOut,
  Monitor,
  Shield,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EmptyState, Modal, Spinner, useToast } from "@/components/ui";
import {
  AccountBody,
  AccountCard,
  AccountCardHeader,
} from "../account-ui";

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
  const text = `${label || ""} ${ua || ""}`.toLowerCase();
  let icon = Laptop;
  let typeLabel = "Desktop";
  let browser: string | null = null;
  let os: string | null = null;

  if (/ipad|tablet/i.test(text)) {
    icon = Tablet;
    typeLabel = "Tablet";
  } else if (/iphone|android|mobile/i.test(text)) {
    icon = Smartphone;
    typeLabel = "Smartphone";
  }

  // Detect OS
  if (/windows/i.test(text)) os = "Windows";
  else if (/macintosh|mac os x/i.test(text)) os = "macOS";
  else if (/linux/i.test(text)) os = "Linux";
  else if (/android/i.test(text)) os = "Android";
  else if (/iphone|ipad|ios/i.test(text)) os = "iOS";

  // Detect Browser
  if (/edg\//i.test(text)) browser = "Microsoft Edge";
  else if (/chrome/i.test(text)) browser = "Google Chrome";
  else if (/firefox/i.test(text)) browser = "Mozilla Firefox";
  else if (/safari/i.test(text) && !/chrome/i.test(text)) browser = "Apple Safari";
  else if (/opera|opr\//i.test(text)) browser = "Opera";
  else if (/brave/i.test(text)) browser = "Brave";

  let displayTitle = label;
  if (!displayTitle) {
    if (browser && os) displayTitle = `${browser} no ${os}`;
    else if (browser) displayTitle = browser;
    else if (os) displayTitle = `${typeLabel} (${os})`;
    else displayTitle = "Dispositivo conectado";
  }

  return {
    Icon: icon,
    typeLabel,
    browser,
    os,
    displayTitle,
  };
}

export default function AccountSessionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmRevokeOthersOpen, setConfirmRevokeOthersOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: () => api<SessionsResponse>("/auth/sessions"),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
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
      <AccountCard>
        <AccountCardHeader
          title="Dispositivos e sessões conectadas"
          subtitle="Gerencie os aparelhos e navegadores com acesso ativo à sua conta"
          icon={Laptop}
          action={
            otherCount > 0 ? (
              <button
                type="button"
                className="btn-secondary h-8.5 px-3 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                onClick={() => setConfirmRevokeOthersOpen(true)}
              >
                Encerrar outras sessões ({otherCount})
              </button>
            ) : null
          }
        />

        <div>
          {sessionsQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-muted dark:text-zinc-400">
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
                      "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 sm:px-7 sm:py-5.5 transition-colors",
                      s.isCurrent
                        ? "bg-violet-500/[0.02] dark:bg-violet-500/[0.04]"
                        : "hover:bg-black/[0.01] dark:hover:bg-white/[0.015]"
                    )}
                  >
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.035] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-300 shadow-xs">
                        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13.5px] font-semibold text-ink dark:text-white truncate">
                            {displayTitle}
                          </p>
                          {s.isCurrent ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Esta sessão (dispositivo atual)
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted dark:text-zinc-400">
                          {s.ip ? (
                            <span className="inline-flex items-center gap-1">
                              <Globe className="h-3 w-3 opacity-60" />
                              {s.ip}
                            </span>
                          ) : null}
                          <span>•</span>
                          <span>Atividade: {formatHumanActivity(s.lastActivityAt)}</span>
                        </div>
                      </div>
                    </div>

                    {!s.isCurrent ? (
                      <div className="shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          className="btn-secondary h-8 px-3 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 gap-1.5"
                          disabled={revokeOne.isPending}
                          onClick={() => revokeOne.mutate(s.id)}
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Encerrar sessão</span>
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

      {/* ── Modal de Confirmação para Encerrar Outras Sessões ── */}
      <Modal
        open={confirmRevokeOthersOpen}
        onClose={() => setConfirmRevokeOthersOpen(false)}
        title="Encerrar todas as outras sessões?"
      >
        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <p className="leading-relaxed">
            Isso desconectará sua conta de todos os outros navegadores, computadores e celulares conectados.
            Apenas este dispositivo atual permanecerá conectado.
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs"
              onClick={() => setConfirmRevokeOthersOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs bg-red-600 hover:bg-red-700"
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
