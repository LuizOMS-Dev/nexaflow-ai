import { normalizeQrInput } from "../qrcode";

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
