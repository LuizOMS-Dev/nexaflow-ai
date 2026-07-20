/**
 * Restaura sessões Baileys após restart da API.
 * Só tenta canais com credenciais persistidas em disco (useMultiFileAuthState).
 * Não pede QR se auth ainda for válida.
 */
import { prisma } from "../../lib/prisma";
import { asConfig } from "./types";
import { hasPersistedAuth, startBaileysSession } from "./baileys-manager";
import { bindWhatsAppSessionMeta } from "./wa-alerts";

let restoreStarted = false;

export async function restoreBaileysSessionsOnBoot(): Promise<{
  attempted: number;
  ok: number;
  failed: number;
}> {
  if (restoreStarted) return { attempted: 0, ok: 0, failed: 0 };
  restoreStarted = true;

  // testes unitários não devem abrir sockets
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    return { attempted: 0, ok: 0, failed: 0 };
  }

  if (process.env.WA_RESTORE_ON_BOOT === "0") {
    console.log("[baileys] restore on boot desabilitado (WA_RESTORE_ON_BOOT=0)");
    return { attempted: 0, ok: 0, failed: 0 };
  }

  const channels = await prisma.channel.findMany({
    where: { type: "WHATSAPP", isActive: true },
    select: { id: true, tenantId: true, name: true, config: true },
  });

  let attempted = 0;
  let ok = 0;
  let failed = 0;

  for (const ch of channels) {
    const config = asConfig(ch.config);
    const provider = String(
      (ch.config as { provider?: string } | null)?.provider || config.provider || ""
    ).toLowerCase();
    if (provider && provider !== "baileys" && provider !== "simulated") continue;
    if (provider === "simulated") continue;

    const instanceName = String(config.instanceName || config.session || "");
    if (!instanceName) continue;
    if (!hasPersistedAuth(instanceName)) {
      console.log(`[baileys] restore skip ${ch.id}: sem creds em disco`);
      continue;
    }

    attempted++;
    try {
      bindWhatsAppSessionMeta(instanceName, {
        tenantId: ch.tenantId,
        channelId: ch.id,
        channelName: ch.name,
      });
      // espaça starts para não saturar
      await new Promise((r) => setTimeout(r, 400 * attempted));
      const state = await startBaileysSession(instanceName);
      if (state.status === "open" || state.status === "connecting") {
        ok++;
        console.log(`[baileys] restore ${instanceName} → ${state.status}`);
      } else {
        failed++;
        console.warn(`[baileys] restore ${instanceName} → ${state.status}`, state.lastError);
      }
    } catch (err) {
      failed++;
      console.error(
        `[baileys] restore failed ${instanceName}`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(`[baileys] restore on boot: attempted=${attempted} ok=${ok} failed=${failed}`);
  return { attempted, ok, failed };
}
