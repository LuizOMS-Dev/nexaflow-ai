import { normalizeQrInput } from "../qrcode";

/** TTL típico do QR do WhatsApp (segundos). */
export const WA_QR_TTL_SEC = 20;

export function qrSecondsLeft(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, WA_QR_TTL_SEC - Math.floor((Date.now() - t) / 1000));
}

/**
 * Normaliza respostas de QR de Evolution/WAHA/Baileys
 * para um data URL estável e escaneável.
 */
export async function resolveWhatsAppQr(parts: {
  base64?: string | null;
  code?: string | null;
  pairingCode?: string | null;
  value?: string | null;
  qr?: string | null;
  existing?: string | null;
}): Promise<{ qrcode: string | null; payload: string | null; source: string }> {
  const candidates = [
    parts.base64,
    parts.code,
    parts.pairingCode,
    parts.value,
    parts.qr,
    parts.existing,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const result = await normalizeQrInput(c);
    if (result.dataUrl) {
      return {
        qrcode: result.dataUrl,
        payload: result.payload,
        source: result.source,
      };
    }
  }

  return { qrcode: null, payload: null, source: "empty" };
}
