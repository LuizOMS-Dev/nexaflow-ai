"use client";

/**
 * Última linha de defesa: erro no root layout.
 * Precisa de html/body próprios (requisito Next.js).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#0B0C10",
          color: "#E5E7EB",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#A5B4FC",
              margin: 0,
            }}
          >
            NexaFlow
          </p>
          <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>
            Erro ao carregar a aplicação
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#9CA3AF", margin: 0 }}>
            Após atualizações, o navegador pode manter arquivos antigos. Use
            recarregar forçado (Ctrl+F5) ou limpe o cache deste site.
          </p>
          {error?.message ? (
            <pre
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 11,
                textAlign: "left",
                overflow: "auto",
                color: "#9CA3AF",
              }}
            >
              {error.message}
            </pre>
          ) : null}
          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 10,
                border: "none",
                background: "#4F46E5",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/login";
              }}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "#E5E7EB",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ir para o login
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
