"use client";

import { cn } from "@/lib/utils";

/**
 * Confirmação visual curta (≈1–1.4s) quando status real === CONNECTED (state open).
 * Sem confetes, sem bloqueio longo.
 */
export function WhatsAppConnectSuccess({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  if (!active) return null;

  return (
    <div
      className={cn(
        "wa-success-stage flex flex-col items-center justify-center rounded-xl border border-line/80 px-6 py-10 text-center dark:border-white/[0.06]",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="WhatsApp conectado"
    >
      <div className="wa-success-glow" aria-hidden />
      <div className="wa-success-ring">
        <svg
          className="wa-success-check"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <circle
            className="wa-success-circle"
            cx="24"
            cy="24"
            r="20"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            className="wa-success-tick"
            d="M15 24.5 L21.5 31 L33.5 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="wa-success-title mt-5 font-display text-base font-semibold tracking-tight text-ink dark:text-white">
        WhatsApp conectado
      </h3>
      <p className="wa-success-sub mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-ink-muted">
        Seu canal está pronto para receber e enviar mensagens.
      </p>
    </div>
  );
}
