"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Laptop,
  MonitorSmartphone,
  Shield,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
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

function formatFullDate(iso: string) {
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

  // Detect OS real
  if (/windows/i.test(text)) os = "Windows";
  else if (/macintosh|mac os x/i.test(text)) os = "macOS";
  else if (/linux/i.test(text)) os = "Linux";
  else if (/android/i.test(text)) os = "Android";
  else if (/iphone|ipad|ios/i.test(text)) os = "iOS";

  // Detect Browser real
  if (/edg\//i.test(text)) browser = "Microsoft Edge";
  else if (/chrome/i.test(text)) browser = "Google Chrome";
  else if (/firefox/i.test(text)) browser = "Mozilla Firefox";
  else if (/safari/i.test(text) && !/chrome/i.test(text)) browser = "Apple Safari";
  else if (/opera|opr\//i.test(text)) browser = "Opera";
  else if (/brave/i.test(text)) browser = "Brave";

  // Build clean display title
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

  const sessions = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: () => api<SessionsResponse>("/auth/sessions"),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ kind: "success", title: "Sessão encerrada com sucesso." });
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
        title: "Outras sessões encerradas com sucesso.",
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
        title="Dispositivos e sessões conectadas"
        subtitle="Monitore e revogue os aparelhos e navegadores atualmente autenticados na sua conta"
        icon={MonitorSmartphone}
        action={
          othersCount > 0 ? (
            <button
              type="button"
              className="btn-secondary h-8.5 px-3.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 shadow-xs"
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
          ) : undefined
        }
      />

      <div>
        {sessions.isLoading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {sessions.isError && (
          <p className="px-6 py-8 text-center text-xs text-red-600 dark:text-red-400">
            Não foi possível carregar as sessões ativas.
          </p>
        )}

        {!sessions.isLoading && !sessions.isError && list.length === 0 && (
          <div className="py-10">
            <EmptyState
              title="Nenhuma sessão ativa encontrada"
              icon={<MonitorSmartphone className="h-5 w-5" strokeWidth={1.5} />}
            />
          </div>
        )}

        {list.length > 0 && (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {list.map((s) => {
              const { Icon, os, browser, displayTitle } = parseDeviceInfo(
                s.deviceLabel,
                s.userAgent
              );
              const metaTags = [browser, os].filter(Boolean) as string[];

              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex flex-col gap-3.5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-6 transition-colors",
                    s.isCurrent
                      ? "bg-violet-500/[0.03] dark:bg-violet-500/[0.05]"
                      : "hover:bg-black/[0.01] dark:hover:bg-white/[0.015]"
                  )}
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                        s.isCurrent
                          ? "bg-violet-500/15 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300 shadow-xs"
                          : "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-300"
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-semibold text-ink dark:text-white">
                          {displayTitle}
                        </p>
                        {s.isCurrent ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Este dispositivo
                          </span>
                        ) : null}
                      </div>

                      {metaTags.length > 0 || s.ip ? (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted dark:text-zinc-400">
                          {metaTags.map((tag, idx) => (
                            <span key={tag} className="flex items-center gap-2">
                              {idx > 0 && <span className="opacity-40">·</span>}
                              <span>{tag}</span>
                            </span>
                          ))}
                          {s.ip ? (
                            <span className="flex items-center gap-2">
                              {metaTags.length > 0 && <span className="opacity-40">·</span>}
                              <span className="font-mono text-[11px] opacity-80">IP {s.ip}</span>
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      <p className="mt-1.5 text-[11.5px] text-ink-faint dark:text-zinc-500">
                        Atividade: <strong className="font-medium text-ink-muted dark:text-zinc-300">{formatHumanActivity(s.lastActivityAt)}</strong>
                        <span className="opacity-40 mx-1.5">·</span>
                        Início em {formatFullDate(s.createdAt)}
                      </p>
                    </div>
                  </div>

                  {!s.isCurrent ? (
                    <button
                      type="button"
                      className="btn-ghost h-8.5 shrink-0 self-start px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 sm:self-auto gap-1.5"
                      disabled={revokeOne.isPending}
                      onClick={() => {
                        if (window.confirm("Encerrar esta sessão?")) {
                          revokeOne.mutate(s.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span>Encerrar</span>
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
