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
        "mb-3 flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        exiting && "wa-banner-exit",
        tone === "danger" &&
          "border-red-500/20 bg-red-500/[0.05] dark:border-red-400/[0.15] dark:bg-red-500/[0.07]",
        tone === "info" &&
          "border-violet-500/20 bg-violet-500/[0.05] dark:border-violet-400/[0.15] dark:bg-violet-500/[0.06]",
        tone === "warning" &&
          "border-amber-500/20 bg-amber-500/[0.05] dark:border-amber-400/[0.15] dark:bg-amber-500/[0.06]"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            tone === "danger" && "bg-red-500/[0.12] text-red-600 dark:text-red-300",
            tone === "info" && "bg-violet-500/[0.12] text-violet-600 dark:text-violet-300",
            tone === "warning" && "bg-amber-500/[0.12] text-amber-700 dark:text-amber-300"
          )}
        >
          <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-snug text-ink dark:text-white">
            {banner.title}
          </p>
          {banner.body?.trim() ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-ink-muted dark:text-gray-400">
              {banner.body}
            </p>
          ) : null}
        </div>
      </div>
      {/* CTA alinhado ao status real — sem botão em RECONNECTING / CONNECTED */}
      {!exiting && actionLabel ? (
        <Link
          href={banner.actionHref || "/app/integrations"}
          className="btn-primary h-8 shrink-0 px-3 text-[11px] sm:self-center"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
