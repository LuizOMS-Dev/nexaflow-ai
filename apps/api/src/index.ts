import { buildApp } from "./app";
import { env } from "./lib/env";
import { assertProductionSafe } from "./services/security/production-guard";
import { getRedis } from "./services/security/redis";

async function main() {
  let redisOk: boolean | null = null;
  try {
    const redis = await getRedis();
    redisOk = Boolean(redis);
  } catch {
    redisOk = false;
  }

  // Fail-closed em production
  try {
    const issues = assertProductionSafe({ redisOk });
    if (issues.length && env.nodeEnv !== "production") {
      for (const i of issues) {
        console.warn(`[security:${i.severity}] ${i.code}: ${i.message}`);
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const app = await buildApp();
  await app.listen({ port: env.port, host: env.host });
  console.log(`🚀 NexaFlow API rodando em http://${env.host}:${env.port}`);
  if (env.aiProvider) {
    console.log(`🤖 IA: provedor=${env.aiProvider} modelo=${env.aiModel}`);
  } else {
    console.log("🤖 IA: heurística local (configure GROQ_API_KEY no .env)");
  }
  console.log(
    `🔐 Superadmin MFA: ${env.superadminMfaRequired ? "obrigatório" : "opcional (teste)"}`
  );
  console.log(`✉️  Mail: ${env.mailProvider}`);
  console.log(`📦 Architecture: single-node (replicas=1)`);

  // Restaura sessões Baileys com credenciais válidas (sem pedir QR de novo)
  setImmediate(() => {
    void import("./services/whatsapp/restore-sessions")
      .then(({ restoreBaileysSessionsOnBoot }) => restoreBaileysSessionsOnBoot())
      .catch((err) => {
        console.error(
          "[baileys] restore on boot error:",
          err instanceof Error ? err.message : err
        );
      });
  });

  // Limpeza periódica de tokens/sessões expirados
  setImmediate(() => {
    void import("./services/maintenance")
      .then(({ startMaintenanceScheduler }) => {
        startMaintenanceScheduler({ log: (m) => console.info(m) });
      })
      .catch((err) => {
        console.warn(
          "[maintenance] scheduler failed:",
          err instanceof Error ? err.message : err
        );
      });
  });

  // Encerramento por inatividade (job in-process, multi-tenant)
  setImmediate(() => {
    void import("./services/conversation-close")
      .then(({ startInactivityCloseScheduler }) => {
        startInactivityCloseScheduler({ log: (m) => console.info(m) });
      })
      .catch((err) => {
        console.warn(
          "[inactivity-close] scheduler failed:",
          err instanceof Error ? err.message : err
        );
      });
  });

  // Retries de webhooks outbound
  setImmediate(() => {
    void import("./services/webhooks/dispatch")
      .then(({ startWebhookRetryScheduler }) => {
        startWebhookRetryScheduler();
      })
      .catch(() => null);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[shutdown] ${signal} — closing HTTP server…`);
    try {
      await app.close();
      console.info("[shutdown] closed cleanly");
      process.exit(0);
    } catch (err) {
      console.error(
        "[shutdown] error:",
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
