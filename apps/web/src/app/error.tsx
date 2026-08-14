"use client";

import { useEffect } from "react";

/**
 * Error boundary de rota — evita tela branca / “Application error” sem saída.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[NexaFlow] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-600/90 dark:text-violet-300/90">
        NexaFlow
      </p>
      <h1 className="mt-2 font-display text-xl font-semibold text-ink dark:text-white">
        Algo deu errado nesta tela
      </h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-muted">
        Pode ser um cache antigo após atualização. Tente recarregar. Se continuar, use
        Ctrl+F5 ou limpe o cache do site.
      </p>
      {process.env.NODE_ENV !== "production" && error?.message ? (
        <p className="mt-3 max-w-lg rounded-xl border border-black/[0.06] bg-black/[0.02] px-3 py-2 font-mono text-[11px] text-ink-faint dark:border-white/[0.08] dark:bg-white/[0.03]">
          {error.message}
        </p>
      ) : null}
      {error.digest ? (
        <p className="mt-3 text-[11px] text-ink-faint">Referência: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn-primary h-9 px-4" onClick={() => reset()}>
          Tentar de novo
        </button>
        <button
          type="button"
          className="btn-secondary h-9 px-4"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Ir ao início
        </button>
        <button
          type="button"
          className="btn-ghost h-9 px-4"
          onClick={() => {
            window.location.reload();
          }}
        >
          Recarregar página
        </button>
      </div>
    </div>
  );
}
