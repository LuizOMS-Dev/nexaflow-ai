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
    const msg = error?.message || "";
    if (
      msg.includes("ChunkLoadError") ||
      msg.includes("Loading chunk") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("is not a valid JavaScript")
    ) {
      const key = "nexaflow_chunk_reload";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 10000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-600 dark:text-indigo-400">
        NexaFlow
      </p>
      <h1 className="mt-2 font-display text-xl font-semibold text-ink dark:text-white">
        Algo deu errado nesta tela
      </h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-muted">
        Pode ser um cache antigo após atualização. Tente recarregar. Se continuar, use
        Ctrl+F5 ou limpe o cache do site.
      </p>
      {error?.message ? (
        <div className="mt-3 max-w-2xl text-left rounded-xl border border-red-500/20 bg-red-500/10 p-4 font-mono text-[12px] text-red-200">
          <p className="font-bold text-red-100">{error.message}</p>
          {error.stack ? (
            <pre className="mt-2 max-h-48 overflow-auto text-[10.5px] opacity-80 whitespace-pre-wrap">
              {error.stack}
            </pre>
          ) : null}
        </div>
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
            window.location.href = "/app";
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
