/**
 * Fonte única de verdade do status operacional do WhatsApp.
 *
 * REGRA: registro Channel no banco ≠ sessão autenticada.
 * CONNECTED só com evidência real de socket/sessão aberta.
 */
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { asConfig, type WhatsAppChannelConfig } from "./types";

export type WhatsAppCanonicalStatus =
  | "NOT_CONFIGURED"
  | "CONNECTING"
  | "QR_REQUIRED"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "ERROR"
  | "LOGGED_OUT";

export type ChannelConnectionView = {
  channelId: string;
  name: string;
  status: WhatsAppCanonicalStatus;
  connected: boolean;
  phone: string | null;
  lastError: string | null;
  lastConnectedAt: string | null;
  /** status bruto do conector (open/connecting/close/unknown) — só debug interno */
  runtimeState: string | null;
};

export type TenantWhatsAppStatus = {
  configured: boolean;
  /** Status agregado do tenant (pior caso se nenhum conectado; CONNECTED se ≥1) */
  status: WhatsAppCanonicalStatus;
  connected: boolean;
  connectedCount: number;
  configuredCount: number;
  lastConnectedAt: string | null;
  lastActivityAt: string | null;
  channels: ChannelConnectionView[];
  /** Textos para UI (saúde / banner) */
  health: {
    status: "OPERANDO" | "ATENCAO" | "INDISPONIVEL" | "SEM_DADOS";
    human: string;
    actionLabel: string;
    actionHref: string;
  };
  banner: {
    show: boolean;
    tone: "warning" | "info" | "danger";
    title: string;
    body: string;
    actionLabel: string;
    actionHref: string;
  };
};

const PRIORITY: Record<WhatsAppCanonicalStatus, number> = {
  CONNECTED: 0,
  RECONNECTING: 1,
  CONNECTING: 2,
  QR_REQUIRED: 3,
  DISCONNECTED: 4,
  ERROR: 5,
  LOGGED_OUT: 6,
  NOT_CONFIGURED: 7,
};

/**
 * Mapeia estado runtime (Baileys/Evolution/config) → status canônico.
 * Nunca trata "isActive" ou "existe channel" como CONNECTED.
 */
export function mapRuntimeToCanonical(params: {
  hasChannel: boolean;
  runtimeState?: string | null;
  hasQr?: boolean;
  lastError?: string | null;
  /** true se a sessão em memória está open (Baileys) */
  liveOpen?: boolean;
  /** config persistia open mas runtime não confirma */
  persistedOpen?: boolean;
}): WhatsAppCanonicalStatus {
  if (!params.hasChannel) return "NOT_CONFIGURED";

  // Única forma de CONNECTED: evidência live (socket/sessão aberta)
  if (params.liveOpen === true) return "CONNECTED";

  const st = (params.runtimeState || "").toLowerCase().trim();

  if (st === "logged_out" || st === "logout") return "LOGGED_OUT";

  // "open" só no config/persistência, sem live → NÃO é conectado
  if (st === "open") return "DISCONNECTED";

  if (st === "connecting") {
    if (params.hasQr) return "QR_REQUIRED";
    return "CONNECTING";
  }

  if (st === "close" || st === "disconnected") {
    if (params.persistedOpen) return "RECONNECTING";
    return "DISCONNECTED";
  }

  if (st === "error" || params.lastError) return "ERROR";

  // Canal no banco sem status confiável = DESCONECTADO (nunca "operando")
  return "DISCONNECTED";
}

function getBaileysLive(instanceName: string | undefined | null): {
  status: string | null;
  phone: string | null;
  qrcode: string | null;
} {
  if (!instanceName) return { status: null, phone: null, qrcode: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getBaileysSession } = require("./baileys-manager") as typeof import("./baileys-manager");
    const s = getBaileysSession(instanceName);
    if (!s) return { status: null, phone: null, qrcode: null };
    return {
      status: s.status,
      phone: s.phone,
      qrcode: s.qrcode,
    };
  } catch {
    return { status: null, phone: null, qrcode: null };
  }
}

/**
 * Resolve status de um channel. Por padrão usa memória Baileys + config
 * sem reiniciar sessão (leve para dashboard).
 * Com probe=true consulta o conector (pode reabrir sessão).
 */
export async function resolveChannelConnection(
  channel: {
    id: string;
    name: string;
    isActive: boolean;
    config: unknown;
    updatedAt?: Date;
  },
  options?: { probe?: boolean }
): Promise<ChannelConnectionView> {
  const config = asConfig(channel.config);
  const instanceName = (config.instanceName || config.session || "") as string;
  // Não usar default "simulated" do asConfig como verdade — preferir baileys da plataforma
  const rawProvider = (channel.config as { provider?: string } | null)?.provider;
  let provider = String(rawProvider || "").toLowerCase();
  if (!provider) {
    provider = String(env.waGatewayProvider || "baileys").toLowerCase();
  } else if (provider === "simulated") {
    provider = "simulated";
  }
  const persistedStatus = String(config.status || "").toLowerCase();
  const lastError = (config.lastError as string) || null;
  const persistedOpen = persistedStatus === "open";
  const lastConnectedAt =
    typeof config.lastConnectedAt === "string"
      ? config.lastConnectedAt
      : persistedOpen && channel.updatedAt
        ? channel.updatedAt.toISOString()
        : null;

  // Simulated: só CONNECTED se config status open (demo consciente)
  if (provider === "simulated") {
    const connected = persistedStatus === "open";
    return {
      channelId: channel.id,
      name: channel.name,
      status: connected
        ? "CONNECTED"
        : mapRuntimeToCanonical({
            hasChannel: true,
            runtimeState: config.status,
            hasQr: Boolean(config.qrcode),
            lastError,
          }),
      connected,
      phone: (config.phone as string) || null,
      lastError,
      lastConnectedAt,
      runtimeState: String(config.status || null),
    };
  }

  // Baileys: fonte de verdade = sessão em memória (e probe opcional no conector)
  if (provider === "baileys" || !provider || provider === "undefined") {
    const live = getBaileysLive(instanceName);
    let runtimeState = live.status;
    let phone = live.phone || (config.phone as string) || null;
    let hasQr = Boolean(live.qrcode || config.qrcode);

    if (options?.probe && runtimeState !== "open" && instanceName) {
      try {
        const { getConnector } = await import("./index");
        const status = await getConnector("baileys").getStatus(config as WhatsAppChannelConfig);
        runtimeState = status.state;
        phone = status.phone || phone;
        hasQr = Boolean(status.qrcode || hasQr);
      } catch {
        runtimeState = runtimeState || "close";
      }
    }

    const liveOpen = runtimeState === "open";
    const status = mapRuntimeToCanonical({
      hasChannel: true,
      runtimeState: runtimeState || config.status || "close",
      hasQr,
      lastError: lastError || (runtimeState === "logged_out" ? "logged_out" : null),
      liveOpen,
      persistedOpen,
    });

    return {
      channelId: channel.id,
      name: channel.name,
      status: runtimeState === "logged_out" ? "LOGGED_OUT" : status,
      connected: liveOpen,
      phone,
      lastError,
      lastConnectedAt: liveOpen
        ? lastConnectedAt || new Date().toISOString()
        : lastConnectedAt,
      runtimeState: runtimeState || String(config.status || null),
    };
  }

  // Evolution / WAHA:
  // - Com probe: consulta o gateway (estado real)
  // - Sem probe / falha do gateway: confia no snapshot do webhook
  //   (status "open" + canal ativo) — evita falso "desconectado" com sessão OK
  // NUNCA isActive sozinho (sem status open).
  const snapshotConnected =
    channel.isActive !== false &&
    (persistedStatus === "open" ||
      (Boolean(config.phone) &&
        persistedStatus !== "close" &&
        persistedStatus !== "logged_out" &&
        persistedStatus !== "logout" &&
        config.everConnected === true));

  if (options?.probe) {
    try {
      const { getConnector } = await import("./index");
      const cfg = {
        ...config,
        baseUrl: config.baseUrl || env.waGatewayUrl,
        apiKey: config.apiKey || env.waGatewayApiKey,
      };
      const status = await getConnector(provider).getStatus(cfg as WhatsAppChannelConfig);
      const liveOpen = status.state === "open";
      const runtimeState = String(status.state || persistedStatus || "unknown").toLowerCase();

      // Gateway confirmou open
      if (liveOpen) {
        return {
          channelId: channel.id,
          name: channel.name,
          status: "CONNECTED",
          connected: true,
          phone: status.phone || (config.phone as string) || null,
          lastError: null,
          lastConnectedAt: lastConnectedAt || new Date().toISOString(),
          runtimeState,
        };
      }

      // Gateway confirmou close/logout — confia no gateway
      if (
        runtimeState === "close" ||
        runtimeState === "logged_out" ||
        runtimeState === "logout" ||
        runtimeState.includes("logout")
      ) {
        const canonical = mapRuntimeToCanonical({
          hasChannel: true,
          runtimeState,
          hasQr: Boolean(status.qrcode || config.qrcode),
          lastError,
          liveOpen: false,
          persistedOpen,
        });
        return {
          channelId: channel.id,
          name: channel.name,
          status: runtimeState.includes("logout") ? "LOGGED_OUT" : canonical,
          connected: false,
          phone: status.phone || (config.phone as string) || null,
          lastError,
          lastConnectedAt,
          runtimeState,
        };
      }

      // Estado connecting/unknown no gateway: se snapshot diz open, mantém CONNECTED
      if (snapshotConnected) {
        return {
          channelId: channel.id,
          name: channel.name,
          status: "CONNECTED",
          connected: true,
          phone: status.phone || (config.phone as string) || null,
          lastError,
          lastConnectedAt: lastConnectedAt || new Date().toISOString(),
          runtimeState: runtimeState || "open",
        };
      }

      const canonical = mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState,
        hasQr: Boolean(status.qrcode || config.qrcode),
        lastError,
        liveOpen: false,
        persistedOpen,
      });
      return {
        channelId: channel.id,
        name: channel.name,
        status: canonical === "CONNECTED" ? "DISCONNECTED" : canonical,
        connected: false,
        phone: status.phone || (config.phone as string) || null,
        lastError,
        lastConnectedAt,
        runtimeState,
      };
    } catch (err) {
      // Falha de probe: não marcar ERROR se snapshot indica sessão aberta
      if (snapshotConnected) {
        return {
          channelId: channel.id,
          name: channel.name,
          status: "CONNECTED",
          connected: true,
          phone: (config.phone as string) || null,
          lastError: null,
          lastConnectedAt: lastConnectedAt || new Date().toISOString(),
          runtimeState: "open",
        };
      }
      return {
        channelId: channel.id,
        name: channel.name,
        status: "ERROR",
        connected: false,
        phone: (config.phone as string) || null,
        lastError: err instanceof Error ? err.message : "Erro ao consultar gateway",
        lastConnectedAt,
        runtimeState: "unknown",
      };
    }
  }

  // Sem probe: snapshot do webhook/DB (open + ativo = conectado)
  if (snapshotConnected) {
    return {
      channelId: channel.id,
      name: channel.name,
      status: "CONNECTED",
      connected: true,
      phone: (config.phone as string) || null,
      lastError: null,
      lastConnectedAt: lastConnectedAt || new Date().toISOString(),
      runtimeState: persistedStatus || "open",
    };
  }

  const status = mapRuntimeToCanonical({
    hasChannel: true,
    runtimeState: persistedStatus || "close",
    hasQr: Boolean(config.qrcode),
    lastError,
    liveOpen: false,
    persistedOpen,
  });

  return {
    channelId: channel.id,
    name: channel.name,
    status: status === "CONNECTED" ? "DISCONNECTED" : status,
    connected: false,
    phone: (config.phone as string) || null,
    lastError,
    lastConnectedAt,
    runtimeState: persistedStatus || null,
  };
}

function buildHealthAndBanner(
  status: WhatsAppCanonicalStatus,
  connectedCount: number,
  configuredCount: number
): Pick<TenantWhatsAppStatus, "health" | "banner"> {
  const href = "/app/integrations";

  if (status === "NOT_CONFIGURED" || configuredCount === 0) {
    return {
      health: {
        status: "ATENCAO",
        human: "WhatsApp não conectado",
        actionLabel: "Conectar WhatsApp",
        actionHref: href,
      },
      banner: {
        show: true,
        tone: "warning",
        title: "WhatsApp não conectado",
        body: "",
        actionLabel: "Conectar WhatsApp",
        actionHref: href,
      },
    };
  }

  if (status === "CONNECTED" && connectedCount > 0) {
    return {
      health: {
        status: "OPERANDO",
        human: "Conectado",
        actionLabel: "Gerenciar canais",
        actionHref: href,
      },
      banner: {
        show: false,
        tone: "info",
        title: "",
        body: "",
        actionLabel: "",
        actionHref: href,
      },
    };
  }

  if (status === "QR_REQUIRED") {
    return {
      health: {
        status: "ATENCAO",
        human: "Aguardando leitura do QR Code",
        actionLabel: "Continuar configuração",
        actionHref: href,
      },
      banner: {
        show: true,
        tone: "info",
        title: "Leia o QR Code no celular",
        body: "",
        actionLabel: "Abrir canais",
        actionHref: href,
      },
    };
  }

  if (status === "CONNECTING" || status === "RECONNECTING") {
    const reconnecting = status === "RECONNECTING";
    return {
      health: {
        status: "ATENCAO",
        human: reconnecting ? "Reconectando" : "Conectando WhatsApp…",
        actionLabel: "Ver canais",
        actionHref: href,
      },
      banner: {
        show: true,
        tone: "info",
        title: reconnecting ? "Reconectando WhatsApp…" : "Conectando WhatsApp…",
        body: "",
        actionLabel: "",
        actionHref: href,
      },
    };
  }

  if (status === "ERROR") {
    return {
      health: {
        status: "INDISPONIVEL",
        human: "Falha na conexão",
        actionLabel: "Reconectar WhatsApp",
        actionHref: href,
      },
      banner: {
        show: true,
        tone: "danger",
        title: "Falha na conexão do WhatsApp",
        body: "",
        actionLabel: "Reconectar",
        actionHref: href,
      },
    };
  }

  if (status === "LOGGED_OUT") {
    return {
      health: {
        status: "INDISPONIVEL",
        human: "Sessão encerrada no aparelho",
        actionLabel: "Reconectar WhatsApp",
        actionHref: href,
      },
      banner: {
        show: true,
        tone: "danger",
        title: "Sessão encerrada no celular",
        body: "",
        actionLabel: "Reconectar",
        actionHref: href,
      },
    };
  }

  // DISCONNECTED — sessão existia, offline temporário
  return {
    health: {
      status: "ATENCAO",
      human: "WhatsApp desconectado",
      actionLabel: "Reconectar WhatsApp",
      actionHref: href,
    },
    banner: {
      show: true,
      tone: "warning",
      title: "WhatsApp desconectado",
      body: "",
      actionLabel: "Reconectar",
      actionHref: href,
    },
  };
}

/**
 * Status agregado do tenant — use em Dashboard, Saúde, Banner, Recomenda.
 */
export async function getTenantWhatsAppStatus(
  tenantId: string,
  options?: { probe?: boolean }
): Promise<TenantWhatsAppStatus> {
  // Preferir canais ativos; se não houver ativos, inclui inativos para reconexão/banner
  const activeRows = await prisma.channel.findMany({
    where: { tenantId, type: "WHATSAPP", isActive: true },
    select: {
      id: true,
      name: true,
      isActive: true,
      config: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const rows =
    activeRows.length > 0
      ? activeRows
      : await prisma.channel.findMany({
          where: { tenantId, type: "WHATSAPP" },
          select: {
            id: true,
            name: true,
            isActive: true,
            config: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "asc" },
        });

  if (rows.length === 0) {
    const { health, banner } = buildHealthAndBanner("NOT_CONFIGURED", 0, 0);
    return {
      configured: false,
      status: "NOT_CONFIGURED",
      connected: false,
      connectedCount: 0,
      configuredCount: 0,
      lastConnectedAt: null,
      lastActivityAt: null,
      channels: [],
      health,
      banner,
    };
  }

  // Evolution: probe leve por padrão (melhor que falso "desconectado")
  const shouldProbe =
    options?.probe === true ||
    (options?.probe !== false &&
      rows.some((r) => {
        const p = String(
          (r.config as { provider?: string } | null)?.provider || env.waGatewayProvider || ""
        ).toLowerCase();
        return p === "evolution" || p === "waha";
      }));

  const channels = await Promise.all(
    rows.map((ch) => resolveChannelConnection(ch, { probe: shouldProbe }))
  );

  const connectedList = channels.filter((c) => c.connected);
  const connectedCount = connectedList.length;
  const connected = connectedCount > 0;

  // Status agregado: se algum CONNECTED → CONNECTED; senão o de maior severidade
  let status: WhatsAppCanonicalStatus = connected
    ? "CONNECTED"
    : channels.reduce((worst, ch) => {
        return PRIORITY[ch.status] > PRIORITY[worst] ? ch.status : worst;
      }, "DISCONNECTED" as WhatsAppCanonicalStatus);

  if (!connected && status === "CONNECTED") status = "DISCONNECTED";

  const lastConnectedAt =
    connectedList
      .map((c) => c.lastConnectedAt)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

  const { health, banner } = buildHealthAndBanner(status, connectedCount, rows.length);

  return {
    configured: true,
    status,
    connected,
    connectedCount,
    configuredCount: rows.length,
    lastConnectedAt,
    lastActivityAt: null,
    channels,
    health,
    banner,
  };
}

/** Contagem segura: só sessões realmente conectadas */
export async function countConnectedWhatsAppChannels(tenantId: string): Promise<number> {
  const s = await getTenantWhatsAppStatus(tenantId);
  return s.connectedCount;
}
