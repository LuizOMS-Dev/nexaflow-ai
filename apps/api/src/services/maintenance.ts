/**
 * Jobs leves de manutenção do backend (sem worker externo).
 * Limpeza de tokens/sessões/desafios expirados — roda no boot e a cada intervalo.
 */
import { prisma } from "../lib/prisma";

export type MaintenanceResult = {
  passwordResets: number;
  mfaChallenges: number;
  expiredSessions: number;
  at: string;
};

/**
 * Remove lixo temporal de segurança (não apaga dados de negócio).
 */
export async function runMaintenanceCleanup(): Promise<MaintenanceResult> {
  const now = new Date();

  const [passwordResets, mfaChallenges, expiredSessions] = await Promise.all([
    prisma.passwordResetToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
      },
    }),
    prisma.mfaChallenge.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
      },
    }),
    // Sessões já revogadas ou expiradas há mais de 7 dias
    prisma.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
          {
            revokedAt: {
              not: null,
              lt: new Date(now.getTime() - 7 * 86_400_000),
            },
          },
        ],
      },
    }),
  ]);

  return {
    passwordResets: passwordResets.count,
    mfaChallenges: mfaChallenges.count,
    expiredSessions: expiredSessions.count,
    at: now.toISOString(),
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Intervalo padrão: 6h */
export function startMaintenanceScheduler(opts?: { intervalMs?: number; log?: (msg: string) => void }) {
  const intervalMs = opts?.intervalMs ?? 6 * 60 * 60 * 1000;
  const log = opts?.log ?? console.info;

  if (timer) return;

  const tick = () => {
    void runMaintenanceCleanup()
      .then((r) => {
        if (r.passwordResets || r.mfaChallenges || r.expiredSessions) {
          log(
            `[maintenance] cleaned resets=${r.passwordResets} mfa=${r.mfaChallenges} sessions=${r.expiredSessions}`
          );
        }
      })
      .catch((err) => {
        console.warn(
          "[maintenance] cleanup failed:",
          err instanceof Error ? err.message : err
        );
      });
  };

  // primeira execução após 45s (não atrasa boot)
  setTimeout(tick, 45_000);
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}

export function stopMaintenanceScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
