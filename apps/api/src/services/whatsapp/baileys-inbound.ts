/**
 * Liga o socket Baileys ao inbox: messages.upsert → ingestInboundMessage.
 * Sem este handler, o WhatsApp recebe a mensagem e nada aparece em Conversas.
 */
import { setBaileysInboundHandler } from "./baileys-manager";
import { resolveSessionMeta } from "./wa-alerts";

let registered = false;

export async function handleBaileysInbound(msg: {
  instanceName: string;
  phone: string;
  name?: string;
  content: string;
  externalId?: string;
  fromMe?: boolean;
}) {
  const content = (msg.content || "").trim();
  if (!content) return;

  const meta = await resolveSessionMeta(msg.instanceName);
  if (!meta) {
    console.warn(
      `[baileys] inbound ignorado: nenhum canal para instance=${msg.instanceName}`
    );
    return { skipped: true as const, reason: "no_channel" };
  }

  if (msg.fromMe) {
    const { ingestExternalOutboundMessage } = await import("./index");
    return ingestExternalOutboundMessage({
      tenantId: meta.tenantId,
      channelId: meta.channelId,
      phone: msg.phone,
      content,
      externalId: msg.externalId,
    });
  }

  const { ingestInboundMessage } = await import("./index");
  return ingestInboundMessage({
    tenantId: meta.tenantId,
    channelId: meta.channelId,
    phone: msg.phone,
    name: msg.name,
    content,
    externalId: msg.externalId,
  });
}

/** Idempotente — pode chamar no boot e ao registrar rotas. */
export function registerBaileysInboundIngest() {
  if (registered) return;
  setBaileysInboundHandler((msg) => {
    void handleBaileysInbound(msg).catch((err) => {
      console.error(
        "[baileys] inbound ingest failed:",
        err instanceof Error ? err.message : err
      );
    });
  });
  registered = true;
}

export function _resetBaileysInboundRegistrationForTests() {
  registered = false;
}
