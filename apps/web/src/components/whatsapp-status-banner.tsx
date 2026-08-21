"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";

type BannerPayload = {
  show: boolean;
  tone: "warning" | "info" | "danger";
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
};

type WaStatusResponse = {
  configured: boolean;
  status: string;
  connected: boolean;
  connectedCount: number;
  configuredCount: number;
  banner: BannerPayload;
};

/**
 * Rótulo do CTA coerente com o status canônico (apresentação apenas).
 * Não altera conexão — só evita botão genérico inconsistente com o título.
 */
function ctaForStatus(status: string | undefined, fromApi: string): string {
  switch (status) {
    case "NOT_CONFIGURED":
      return "Conectar WhatsApp";
    case "LOGGED_OUT":
      return "Reconectar WhatsApp";
    case "DISCONNECTED":
      return "Reconectar WhatsApp";
    case "ERROR":
      return "Reconectar WhatsApp";
    case "RECONNECTING":
    case "CONNECTING":
      return ""; // reconexão automática — sem CTA primário
    case "QR_REQUIRED":
      return fromApi || "Continuar configuração";
    case "CONNECTED":
      return "";
    default:
      return fromApi || "";
  }
}

/**
 * Alerta global compacto + saída suave quando CONNECTED (banner.show → false).
 */
export function WhatsAppStatusBanner() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const tenant = useAuth((s) => s.tenant);

  const enabled = Boolean(user && token !== undefined && tenant?.id);

  const { data } = useQuery({
    queryKey: ["whatsapp-status", tenant?.id],
    queryFn: () => api<WaStatusResponse>("/whatsapp/status"),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const [banner, setBanner] = useState<BannerPayload | null>(null);
  const [waStatus, setWaStatus] = useState<string | undefined>();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const next = data?.banner;
    // Conectado de verdade: nunca manter aviso de desconectado
    const reallyConnected =
      data?.connected === true || data?.status === "CONNECTED";
    if (next?.show && !reallyConnected) {
      setBanner(next);
      setWaStatus(data?.status);
      setExiting(false);
      return;
    }
    // CONNECTED (ou sem alerta): anima saída se estava visível
    if (banner && !exiting) {
      setExiting(true);
      const t = window.setTimeout(() => {
        setBanner(null);
        setWaStatus(undefined);
        setExiting(false);
      }, 320);
      return () => window.clearTimeout(t);
    }
    if (reallyConnected && !banner) {
      setBanner(null);
      setWaStatus(undefined);
    }
  }, [data?.banner, data?.status, data?.connected, banner, exiting]);

  if (!enabled || !banner) return null;

  const tone = banner.tone || "warning";
  const actionLabel = ctaForStatus(waStatus, banner.actionLabel);

  return (
    <div
      role="status"
      className={cn(
        "mb-2.5 flex min-h-[40px] items-center justify-between gap-3 rounded-lg border px-3 py-1.5 transition-all duration-200",
        exiting && "opacity-0 scale-[0.99] pointer-events-none",
        tone === "danger" &&
          "border-red-500/20 bg-red-500/[0.06] text-red-700 dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-300",
        tone === "info" &&
          "border-violet-500/20 bg-violet-500/[0.06] text-violet-700 dark:border-violet-400/20 dark:bg-violet-950/40 dark:text-violet-300",
        tone === "warning" &&
          "border-amber-500/20 bg-amber-500/[0.06] text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-200"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            tone === "danger" && "bg-red-500 animate-pulse",
            tone === "info" && "bg-violet-500",
            tone === "warning" && "bg-amber-500 animate-pulse"
          )}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px]">
          <span className="font-semibold text-ink dark:text-white">
            {banner.title}
          </span>
          {banner.body?.trim() ? (
            <span className="hidden sm:inline text-ink-muted dark:text-zinc-400">
              · {banner.body}
            </span>
          ) : null}
        </div>
      </div>

      {!exiting && actionLabel ? (
        <Link
          href={banner.actionHref || "/app/integrations"}
          className="inline-flex h-7 shrink-0 items-center rounded-md bg-violet-600 px-2.5 text-[11px] font-medium text-white hover:bg-violet-700 active:scale-95 transition-all shadow-sm"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
