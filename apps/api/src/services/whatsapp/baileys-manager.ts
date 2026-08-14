/**
 * WhatsAppConnectionManager (Baileys) — single socket por instanceName.
 *
 * - useMultiFileAuthState (persistência em disco; migração SQL planejada)
 * - creds.update salvo imediatamente via saveCreds (com log em falha)
 * - reconexão com backoff + circuit breaker
 * - NÃO apaga credenciais em erro transitório
 * - LOGGED_OUT só com evidência real de logout
 */
import { generateQrDataUrl } from "../qrcode";
import {
  classifyDisconnect,
  reconnectDelayMs,
  shouldInvalidateAuth,
  shouldReconnect,
  type DisconnectClass,
} from "./disconnect-classify";
import { createMultiFileAuthStore, sessionsRoot } from "./auth-store";
import { emitWhatsAppAlert } from "./wa-alerts";

export { sessionsRoot };

export type SessionHealth = "HEALTHY" | "DEGRADED" | "RECONNECTING" | "DOWN" | "LOGGED_OUT";

export type SessionState = {
  instanceName: string;
  status: "connecting" | "open" | "close" | "logged_out";
  qrcode: string | null;
  phone: string | null;
  lastError: string | null;
  sock?: any;
  /** métricas operacionais */
  connectedAt: Date | null;
  lastConnectionAt: Date | null;
  lastDisconnectAt: Date | null;
  lastEventAt: Date | null;
  lastMessageReceivedAt: Date | null;
  lastMessageSentAt: Date | null;
  reconnectAttempt: number;
  reconnectCount24h: number;
  reconnectWindowStart: number;
  consecutiveFailures: number;
  circuitOpenUntil: number;
  lastDisconnectClass: DisconnectClass | null;
  health: SessionHealth;
};

type InboundHandler = (msg: {
  instanceName: string;
  phone: string;
  name?: string;
  content: string;
  externalId?: string;
  fromMe?: boolean;
}) => Promise<void> | void;

const sessions = new Map<string, SessionState>();
/** Impede start concorrente do mesmo instanceName */
const starting = new Map<string, Promise<SessionState>>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

let inboundHandler: InboundHandler | null = null;

const CIRCUIT_FAILURES = Number(process.env.WA_CIRCUIT_FAILURES || 10);
const CIRCUIT_COOLDOWN_MS = Number(process.env.WA_CIRCUIT_COOLDOWN_MS || 5 * 60_000);

export function setBaileysInboundHandler(handler: InboundHandler) {
  inboundHandler = handler;
}

function emptyState(instanceName: string): SessionState {
  return {
    instanceName,
    status: "close",
    qrcode: null,
    phone: null,
    lastError: null,
    connectedAt: null,
    lastConnectionAt: null,
    lastDisconnectAt: null,
    lastEventAt: null,
    lastMessageReceivedAt: null,
    lastMessageSentAt: null,
    reconnectAttempt: 0,
    reconnectCount24h: 0,
    reconnectWindowStart: Date.now(),
    consecutiveFailures: 0,
    circuitOpenUntil: 0,
    lastDisconnectClass: null,
    health: "DOWN",
  };
}

function getOrCreateState(instanceName: string): SessionState {
  let s = sessions.get(instanceName);
  if (!s) {
    s = emptyState(instanceName);
    sessions.set(instanceName, s);
  }
  return s;
}

export function getBaileysSession(instanceName: string): SessionState | null {
  return sessions.get(instanceName) || null;
}

export function listBaileysSessions(): SessionState[] {
  return Array.from(sessions.values());
}

export function hasPersistedAuth(instanceName: string): boolean {
  try {
    return createMultiFileAuthStore(instanceName).hasCredentials();
  } catch {
    return false;
  }
}

function clearReconnectTimer(instanceName: string) {
  const t = reconnectTimers.get(instanceName);
  if (t) {
    clearTimeout(t);
    reconnectTimers.delete(instanceName);
  }
}

function bumpReconnectStats(state: SessionState) {
  const now = Date.now();
  if (now - state.reconnectWindowStart > 24 * 3600_000) {
    state.reconnectWindowStart = now;
    state.reconnectCount24h = 0;
  }
  state.reconnectCount24h += 1;
}

function scheduleReconnect(instanceName: string, reason: string) {
  const state = getOrCreateState(instanceName);
  if (state.status === "logged_out") return;
  if (Date.now() < state.circuitOpenUntil) {
    state.health = "DOWN";
    state.lastError = `Circuit breaker ativo até ${new Date(state.circuitOpenUntil).toISOString()}`;
    console.warn(`[baileys] ${instanceName} circuit open — skip reconnect (${reason})`);
    return;
  }

  clearReconnectTimer(instanceName);
  const delay = reconnectDelayMs(state.reconnectAttempt);
  state.reconnectAttempt += 1;
  bumpReconnectStats(state);
  state.health = "RECONNECTING";
  state.status = "connecting";
  console.log(
    `[baileys] ${instanceName} reconecta em ${delay}ms (attempt=${state.reconnectAttempt}, ${reason})`
  );

  const timer = setTimeout(() => {
    reconnectTimers.delete(instanceName);
    void startBaileysSession(instanceName).catch((err) => {
      console.error("[baileys] reconnect failed", instanceName, err);
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= CIRCUIT_FAILURES) {
        state.circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        state.health = "DOWN";
        state.lastError = `Muitas falhas consecutivas (${state.consecutiveFailures}). Pausa temporária.`;
        console.error(`[baileys] ${instanceName} circuit breaker OPEN`);
      } else {
        scheduleReconnect(instanceName, "retry_after_fail");
      }
    });
  }, delay);
  reconnectTimers.set(instanceName, timer);
}

async function endSocket(sock: any) {
  if (!sock) return;
  try {
    sock.ev?.removeAllListeners?.();
  } catch {
    /* ignore */
  }
  try {
    sock.end?.(undefined);
  } catch {
    /* ignore */
  }
}

/**
 * Inicia ou reutiliza sessão Baileys (máx. 1 socket por instanceName neste processo).
 */
export async function startBaileysSession(instanceName: string): Promise<SessionState> {
  if (!instanceName) throw new Error("instanceName obrigatório");

  const existingStart = starting.get(instanceName);
  if (existingStart) return existingStart;

  const run = (async () => {
    const state = getOrCreateState(instanceName);

    if (Date.now() < state.circuitOpenUntil) {
      state.lastError = "Circuit breaker ativo — tente mais tarde";
      state.health = "DOWN";
      return state;
    }

    // single socket: já open
    if (state.sock && state.status === "open") return state;

    // connecting com socket — não duplicar
    if (state.sock && state.status === "connecting") return state;

    clearReconnectTimer(instanceName);
    await endSocket(state.sock);
    state.sock = undefined;
    state.status = "connecting";
    state.qrcode = null;
    state.lastError = null;
    state.health = "RECONNECTING";
    state.lastEventAt = new Date();

    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket =
      (baileys as any).default?.default ||
      (baileys as any).default ||
      (baileys as any).makeWASocket;
    const DisconnectReason = (baileys as any).DisconnectReason;
    const fetchLatestBaileysVersion = (baileys as any).fetchLatestBaileysVersion;
    const Browsers = (baileys as any).Browsers;

    const authStore = createMultiFileAuthStore(instanceName);
    const { state: authState, saveCreds } = await authStore.open();

    /** Persistência imediata de creds — falha = log crítico (não silenciar) */
    const safeSaveCreds = async () => {
      try {
        await saveCreds();
        state.lastEventAt = new Date();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.lastError = `Falha ao salvar credenciais: ${msg}`;
        console.error(`[baileys] CRITICAL creds.update save failed ${instanceName}:`, msg);
      }
    };

    let version: [number, number, number] | undefined;
    try {
      const v = await fetchLatestBaileysVersion();
      version = v.version;
    } catch {
      version = undefined;
    }

    const sock = makeWASocket({
      auth: authState,
      version,
      printQRInTerminal: false,
      browser: Browsers?.ubuntu?.("Chrome") || ["NexaFlow", "Chrome", "120.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    state.sock = sock;

    sock.ev.on("creds.update", () => {
      void safeSaveCreds();
    });

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update || {};
      state.lastEventAt = new Date();

      if (qr) {
        try {
          state.qrcode = await generateQrDataUrl(qr, { width: 320 });
          state.status = "connecting";
          state.health = "DEGRADED";
        } catch (e) {
          state.lastError = e instanceof Error ? e.message : "Falha ao gerar QR";
        }
      }

      if (connection === "open") {
        state.status = "open";
        state.qrcode = null;
        const id = sock.user?.id || "";
        state.phone = id.split(":")[0] || id.replace(/@.*/, "") || null;
        state.lastError = null;
        state.connectedAt = state.connectedAt || new Date();
        state.lastConnectionAt = new Date();
        state.reconnectAttempt = 0;
        state.consecutiveFailures = 0;
        state.circuitOpenUntil = 0;
        state.health = "HEALTHY";
        state.lastDisconnectClass = null;
        console.log(`[baileys] ${instanceName} CONNECTED`, state.phone);
        // Setup histórico: primeiro CONNECTED não regride se desconectar depois
        void import("./wa-alerts")
          .then(({ resolveSessionMeta }) => resolveSessionMeta(instanceName))
          .then(async (meta) => {
            if (!meta?.tenantId) return;
            const { markWhatsAppConfigured } = await import("../tenant-setup-checklist");
            await markWhatsAppConfigured(meta.tenantId);
          })
          .catch((err) =>
            console.warn("[baileys] markWhatsAppConfigured failed:", err instanceof Error ? err.message : err)
          );
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode as number | undefined;
        const klass = classifyDisconnect(code, DisconnectReason);
        state.lastDisconnectClass = klass;
        state.lastDisconnectAt = new Date();
        state.sock = undefined;
        state.qrcode = null;

        console.warn(`[baileys] ${instanceName} close code=${code} class=${klass}`);

        if (shouldInvalidateAuth(klass)) {
          state.status = "logged_out";
          state.health = "LOGGED_OUT";
          state.lastError =
            klass === "LOGGED_OUT"
              ? "Desconectado do WhatsApp (logout no aparelho)"
              : `Sessão inválida (${klass}) — reconecte com QR`;
          authStore.wipe();
          void emitWhatsAppAlert(instanceName, "LOGGED_OUT");
          // NÃO reconecta em loop
          return;
        }

        state.status = "close";
        state.health = "RECONNECTING";
        state.lastError = `Conexão fechada (${klass}${code != null ? `/${code}` : ""})`;
        state.consecutiveFailures += 1;

        if (state.consecutiveFailures >= CIRCUIT_FAILURES) {
          state.circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
          state.health = "DOWN";
          state.lastError = `Circuit breaker: ${state.consecutiveFailures} falhas. Pausa ${Math.round(CIRCUIT_COOLDOWN_MS / 1000)}s.`;
          console.error(`[baileys] ${instanceName} circuit breaker OPEN`);
          void emitWhatsAppAlert(instanceName, "CIRCUIT_OPEN");
          return;
        }

        if (shouldReconnect(klass)) {
          // RESTART_REQUIRED e transitórios: recria socket com MESMAS creds (não apaga)
          scheduleReconnect(instanceName, klass);
        }
      }
    });

    sock.ev.on("messages.upsert", async (payload: any) => {
      try {
        const messages = payload?.messages || [];
        for (const m of messages) {
          if (!m?.message) continue;
          const fromMe = Boolean(m.key?.fromMe);
          // loop guard: ignora eco das próprias mensagens
          if (fromMe) continue;
          const jid = m.key?.remoteJid || "";
          if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;

          const phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
          const content =
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.imageMessage?.caption ||
            m.message?.videoMessage?.caption ||
            (m.message?.imageMessage ? "[imagem]" : null) ||
            (m.message?.audioMessage ? "[áudio]" : null) ||
            (m.message?.documentMessage ? "[documento]" : "[mensagem]");

          if (!content) continue;

          state.lastMessageReceivedAt = new Date();
          state.lastEventAt = new Date();

          if (inboundHandler) {
            await inboundHandler({
              instanceName,
              phone,
              name: m.pushName,
              content,
              externalId: m.key?.id,
              fromMe: false,
            });
          }
        }
      } catch (err) {
        console.error("[baileys] messages.upsert error", err);
      }
    });

    // aguarda QR ou open
    for (let i = 0; i < 25; i++) {
      const cur = sessions.get(instanceName);
      if (cur?.qrcode || cur?.status === "open" || cur?.status === "logged_out") break;
      await new Promise((r) => setTimeout(r, 200));
    }

    return sessions.get(instanceName) || state;
  })();

  starting.set(instanceName, run);
  try {
    return await run;
  } finally {
    starting.delete(instanceName);
  }
}

export async function stopBaileysSession(instanceName: string, logout = false) {
  clearReconnectTimer(instanceName);
  const state = sessions.get(instanceName);
  if (!state) return;

  if (state.sock) {
    try {
      if (logout) await state.sock.logout?.();
      else await endSocket(state.sock);
    } catch {
      /* ignore */
    }
  }
  state.sock = undefined;
  state.qrcode = null;
  state.lastDisconnectAt = new Date();

  if (logout) {
    state.status = "logged_out";
    state.health = "LOGGED_OUT";
    try {
      createMultiFileAuthStore(instanceName).wipe();
    } catch {
      /* ignore */
    }
  } else {
    // desconectar socket sem invalidar credenciais
    state.status = "close";
    state.health = "DOWN";
  }
}

export async function sendBaileysText(instanceName: string, to: string, text: string) {
  const state = sessions.get(instanceName);
  if (!state?.sock || state.status !== "open") {
    return { ok: false, error: "Sessão WhatsApp não conectada" };
  }
  const number = to.replace(/\D/g, "");
  const jid = `${number}@s.whatsapp.net`;
  try {
    const result = await state.sock.sendMessage(jid, { text });
    state.lastMessageSentAt = new Date();
    state.lastEventAt = new Date();
    return { ok: true, externalId: result?.key?.id, raw: result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao enviar",
    };
  }
}

export function getSessionDiagnostics(instanceName: string) {
  const s = sessions.get(instanceName);
  if (!s) {
    return {
      instanceName,
      status: "close" as const,
      health: "DOWN" as SessionHealth,
      connected: false,
      hasPersistedAuth: hasPersistedAuth(instanceName),
      phone: null as string | null,
      reconnectCount24h: 0,
      lastError: null as string | null,
      uptimeSeconds: null as number | null,
      lastActivityAt: null as string | null,
    };
  }
  const uptimeSeconds =
    s.status === "open" && s.lastConnectionAt
      ? Math.floor((Date.now() - s.lastConnectionAt.getTime()) / 1000)
      : null;
  const lastActivity =
    s.lastMessageReceivedAt || s.lastMessageSentAt || s.lastEventAt || s.lastConnectionAt;
  return {
    instanceName,
    status: s.status,
    health: s.health,
    connected: s.status === "open",
    hasPersistedAuth: hasPersistedAuth(instanceName),
    phone: s.phone,
    reconnectCount24h: s.reconnectCount24h,
    consecutiveFailures: s.consecutiveFailures,
    lastDisconnectClass: s.lastDisconnectClass,
    lastError: s.lastError,
    uptimeSeconds,
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    circuitOpen: Date.now() < s.circuitOpenUntil,
  };
}
