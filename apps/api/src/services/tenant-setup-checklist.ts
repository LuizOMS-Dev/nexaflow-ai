/**
 * Checklist de configuração inicial da Home (histórico / setup).
 *
 * NÃO usa status operacional atual do WhatsApp.
 * Uma etapa concluída permanece concluída (não regride por desconexão).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asConfig } from "./whatsapp/types";

export type SetupChecklist = {
  /** WhatsApp já conectou com sucesso pelo menos uma vez */
  whatsappConfigured: boolean;
  whatsappConfiguredAt: string | null;
  /** Já existe (ou existiu marcado) ao menos um agente */
  agentCreated: boolean;
  agentCreatedAt: string | null;
  /** Já existe (ou existiu marcado) ao menos um funil */
  pipelineCreated: boolean;
  pipelineCreatedAt: string | null;
  /** As 3 etapas foram concluídas — Home esconde o bloco */
  homeSetupCompleted: boolean;
  homeSetupCompletedAt: string | null;
};

type SettingsBag = Record<string, unknown>;

function asSettings(raw: unknown): SettingsBag {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as SettingsBag) };
  }
  return {};
}

function readBool(s: SettingsBag, key: string): boolean {
  return s[key] === true;
}

function readIso(s: SettingsBag, key: string): string | null {
  const v = s[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function fromSettings(s: SettingsBag): SetupChecklist {
  return {
    whatsappConfigured: readBool(s, "whatsappConfigured"),
    whatsappConfiguredAt: readIso(s, "whatsappConfiguredAt"),
    agentCreated: readBool(s, "agentCreated"),
    agentCreatedAt: readIso(s, "agentCreatedAt"),
    pipelineCreated: readBool(s, "pipelineCreated"),
    pipelineCreatedAt: readIso(s, "pipelineCreatedAt"),
    homeSetupCompleted: readBool(s, "homeSetupCompleted"),
    homeSetupCompletedAt: readIso(s, "homeSetupCompletedAt"),
  };
}

function channelEverConnected(config: unknown): boolean {
  const c = asConfig(config);
  if (c.everConnected === true) return true;
  if (typeof c.lastConnectedAt === "string" && c.lastConnectedAt.length > 0) return true;
  // Já teve número de telefone gravado = sessão autenticada com sucesso no passado
  if (typeof c.phone === "string" && c.phone.trim().length > 0) return true;
  // status open histórico no config
  if (String(c.status || "").toLowerCase() === "open") return true;
  return false;
}

async function persistFlags(tenantId: string, patch: Partial<SetupChecklist>) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  if (!tenant) return fromSettings({});

  const prev = asSettings(tenant.settings);
  const next: SettingsBag = { ...prev };

  if (patch.whatsappConfigured === true && prev.whatsappConfigured !== true) {
    next.whatsappConfigured = true;
    next.whatsappConfiguredAt =
      patch.whatsappConfiguredAt || prev.whatsappConfiguredAt || new Date().toISOString();
  }
  if (patch.agentCreated === true && prev.agentCreated !== true) {
    next.agentCreated = true;
    next.agentCreatedAt = patch.agentCreatedAt || prev.agentCreatedAt || new Date().toISOString();
  }
  if (patch.pipelineCreated === true && prev.pipelineCreated !== true) {
    next.pipelineCreated = true;
    next.pipelineCreatedAt =
      patch.pipelineCreatedAt || prev.pipelineCreatedAt || new Date().toISOString();
  }

  const checklist = fromSettings(next);
  const allDone =
    checklist.whatsappConfigured && checklist.agentCreated && checklist.pipelineCreated;

  if (allDone && next.homeSetupCompleted !== true) {
    next.homeSetupCompleted = true;
    next.homeSetupCompletedAt = new Date().toISOString();
  }

  // Só grava se algo mudou
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (changed) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: next as Prisma.InputJsonValue },
    });
  }

  return fromSettings(next);
}

/**
 * Lê checklist; faz backfill seguro a partir de evidências históricas
 * (sem depender de sessão live).
 */
export async function getSetupChecklist(tenantId: string): Promise<SetupChecklist> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  if (!tenant) {
    return {
      whatsappConfigured: false,
      whatsappConfiguredAt: null,
      agentCreated: false,
      agentCreatedAt: null,
      pipelineCreated: false,
      pipelineCreatedAt: null,
      homeSetupCompleted: false,
      homeSetupCompletedAt: null,
    };
  }

  let checklist = fromSettings(asSettings(tenant.settings));

  // Já completo: não reprocessa
  if (checklist.homeSetupCompleted) return checklist;

  const patch: Partial<SetupChecklist> = {};

  if (!checklist.whatsappConfigured) {
    const channels = await prisma.channel.findMany({
      where: { tenantId, type: "WHATSAPP" },
      select: { config: true },
      take: 50,
    });
    if (channels.some((ch) => channelEverConnected(ch.config))) {
      patch.whatsappConfigured = true;
    }
  }

  if (!checklist.agentCreated) {
    const n = await prisma.aiAgent.count({ where: { tenantId } });
    if (n > 0) patch.agentCreated = true;
  }

  if (!checklist.pipelineCreated) {
    const n = await prisma.pipeline.count({ where: { tenantId } });
    if (n > 0) patch.pipelineCreated = true;
  }

  if (Object.keys(patch).length > 0) {
    checklist = await persistFlags(tenantId, patch);
  } else {
    // ainda assim pode fechar homeSetup se as 3 já estão true mas flag faltou
    if (
      checklist.whatsappConfigured &&
      checklist.agentCreated &&
      checklist.pipelineCreated &&
      !checklist.homeSetupCompleted
    ) {
      checklist = await persistFlags(tenantId, {});
    }
  }

  return checklist;
}

/** Primeiro CONNECTED real — irreversível no checklist. */
export async function markWhatsAppConfigured(tenantId: string): Promise<SetupChecklist> {
  // marca canal com everConnected
  const channels = await prisma.channel.findMany({
    where: { tenantId, type: "WHATSAPP" },
    select: { id: true, config: true },
    take: 20,
  });
  const now = new Date().toISOString();
  await Promise.all(
    channels.map(async (ch) => {
      const cfg = asConfig(ch.config);
      if (cfg.everConnected === true && cfg.lastConnectedAt) return;
      await prisma.channel.update({
        where: { id: ch.id },
        data: {
          config: {
            ...cfg,
            everConnected: true,
            lastConnectedAt: cfg.lastConnectedAt || now,
          } as Prisma.InputJsonValue,
        },
      });
    })
  );

  return persistFlags(tenantId, {
    whatsappConfigured: true,
    whatsappConfiguredAt: now,
  });
}

export async function markAgentCreated(tenantId: string): Promise<SetupChecklist> {
  return persistFlags(tenantId, { agentCreated: true });
}

export async function markPipelineCreated(tenantId: string): Promise<SetupChecklist> {
  return persistFlags(tenantId, { pipelineCreated: true });
}

/**
 * Se status operacional é CONNECTED agora e ainda não há flag histórica, grava.
 * Usado no dashboard / status (idempotente). Sempre devolve checklist completo.
 */
export async function ensureWhatsAppConfiguredFromLive(
  tenantId: string,
  isCurrentlyConnected: boolean
): Promise<SetupChecklist> {
  if (isCurrentlyConnected) {
    await markWhatsAppConfigured(tenantId);
  }
  return getSetupChecklist(tenantId);
}
