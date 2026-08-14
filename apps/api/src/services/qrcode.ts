import { randomUUID } from "crypto";
import QRCode from "qrcode";

export type QrNormalizeResult = {
  /** Data URL pronta para <img src> */
  dataUrl: string | null;
  /** Payload cru (código de pareamento) se aplicável */
  payload: string | null;
  source: "image" | "generated" | "empty";
  error?: string;
};

/**
 * Sistema de QR Code do NexaFlow
 * - Aceita data URL, base64 puro ou string de pareamento (WhatsApp/Baileys)
 * - Gera PNG de alta legibilidade com a lib `qrcode` (padrão de mercado)
 * - Nunca embute segredos de API no QR — só o payload de pareamento
 */
export async function normalizeQrInput(input?: string | null): Promise<QrNormalizeResult> {
  if (!input || !String(input).trim()) {
    return { dataUrl: null, payload: null, source: "empty" };
  }

  const raw = String(input).trim();

  // Já é data URL de imagem
  if (raw.startsWith("data:image/")) {
    return { dataUrl: raw, payload: null, source: "image" };
  }

  // base64 PNG/JPEG sem prefixo (heurística: só base64 longo)
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.replace(/\s/g, "").length > 200) {
    const clean = raw.replace(/\s/g, "");
    // tenta detectar PNG (iVBOR) vs JPEG (/9j/)
    const mime = clean.startsWith("/9j/") ? "image/jpeg" : "image/png";
    return {
      dataUrl: `data:${mime};base64,${clean}`,
      payload: null,
      source: "image",
    };
  }

  // String de pareamento / URL / código — geramos QR limpo
  try {
    const dataUrl = await QRCode.toDataURL(raw, {
      errorCorrectionLevel: "M",
      type: "image/png",
      margin: 2,
      width: 320,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    });
    return { dataUrl, payload: raw, source: "generated" };
  } catch (err) {
    return {
      dataUrl: null,
      payload: raw,
      source: "empty",
      error: err instanceof Error ? err.message : "Falha ao gerar QR",
    };
  }
}

export async function generateQrDataUrl(
  payload: string,
  opts?: { width?: number; margin?: number }
): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    type: "image/png",
    margin: opts?.margin ?? 2,
    width: opts?.width ?? 320,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });
}

/** Gera um token de sessão curto (uso em pareamento seguro) */
export function createPairingToken(): string {
  const a = randomUUID().replace(/-/g, "");
  const b = Date.now().toString(36);
  return `nf_${b}_${a.slice(0, 24)}`;
}
