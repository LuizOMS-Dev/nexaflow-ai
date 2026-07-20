"use client";

import { useEffect, useState } from "react";
import { Loader2, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type QrDisplayProps = {
  /** data:image/... ou null */
  src?: string | null;
  /** segundos até expirar (WhatsApp ~45s) */
  expiresIn?: number | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  label?: string;
  hint?: string;
  size?: number;
  className?: string;
};

/**
 * Exibição de QR Code escaneável e segura:
 * - moldura com alto contraste
 * - contagem regressiva de validade
 * - botão de atualizar
 * - nunca mostra API keys (só a imagem do QR)
 */
export function QrDisplay({
  src,
  expiresIn = null,
  loading,
  error,
  onRefresh,
  label = "Escaneie o QR Code",
  hint = "WhatsApp → Aparelhos conectados → Conectar um aparelho",
  size = 240,
  className,
}: QrDisplayProps) {
  const [left, setLeft] = useState<number | null>(expiresIn);
  const [tickKey, setTickKey] = useState(0);

  useEffect(() => {
    setLeft(expiresIn ?? null);
    setTickKey((k) => k + 1);
  }, [src, expiresIn]);

  useEffect(() => {
    if (expiresIn == null) return;
    const t = setInterval(() => {
      setLeft((v) => (v == null ? null : Math.max(0, v - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [tickKey, expiresIn]);

  const expired = left !== null && left <= 0;
  const progress =
    expiresIn && left != null ? Math.max(0, Math.min(100, (left / expiresIn) * 100)) : 100;

  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface-muted p-5 text-center dark:border-[#262b36] dark:bg-white/[0.02]",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-center gap-2 text-sm font-medium text-ink dark:text-white">
        <QrCode className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        {label}
      </div>

      <div className="relative mx-auto inline-block">
        <div
          className={cn(
            "rounded-2xl bg-white p-3 shadow-soft ring-1 ring-black/5",
            (loading || expired || !src) && "opacity-60"
          )}
          style={{ width: size + 24, height: size + 24 }}
        >
          {loading && (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          )}

          {!loading && src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt="QR Code"
              width={size}
              height={size}
              className="h-full w-full rounded-lg object-contain"
              draggable={false}
            />
          )}

          {!loading && !src && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted">
              <QrCode className="h-10 w-10 opacity-30" />
              <p className="text-xs">Aguardando QR…</p>
            </div>
          )}
        </div>

        {expired && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-[1px] dark:bg-black/50">
            <div className="px-3 text-center">
              <p className="text-sm font-semibold text-ink dark:text-white">QR expirado</p>
              <p className="mt-1 text-xs text-ink-muted">Atualize para gerar um novo</p>
            </div>
          </div>
        )}
      </div>

      {expiresIn != null && left != null && !expired && src && (
        <div className="mx-auto mt-4 max-w-[240px]">
          <div className="mb-1 flex items-center justify-between text-2xs text-ink-faint">
            <span>Validade do QR</span>
            <span className="font-medium tabular-nums text-ink-muted">{left}s</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line dark:bg-white/10">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">{hint}</p>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-2xs text-ink-faint">
        <ShieldCheck className="h-3.5 w-3.5" />
        QR seguro · sem chaves de API
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      )}

      {onRefresh && (
        <button type="button" className="btn-secondary mt-4 h-9 text-xs" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {expired ? "Gerar novo QR" : "Atualizar QR"}
        </button>
      )}
    </div>
  );
}
