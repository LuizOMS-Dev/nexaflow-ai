/**
 * Parser determinístico e seguro de User-Agent e metadados de sessão.
 * Aplica precedência rigorosa para evitar falsos positivos (ex.: Opera/Edge/Samsung Internet como Chrome).
 */

export type DeviceType = "Desktop" | "Tablet" | "Smartphone";

export interface ParsedDeviceInfo {
  browser: string | null;
  os: string | null;
  deviceType: DeviceType;
  displayTitle: string;
}

export function parseUserAgent(ua: string | null | undefined, label?: string | null | undefined): ParsedDeviceInfo {
  const source = `${ua || ""} ${label || ""}`.trim();
  let deviceType: DeviceType = "Desktop";
  let browser: string | null = null;
  let os: string | null = null;

  // 1. Tipo de dispositivo
  if (/ipad|tablet/i.test(source)) {
    deviceType = "Tablet";
  } else if (/iphone|ipod|android.*mobile|mobile.*android|mobile/i.test(source)) {
    deviceType = "Smartphone";
  } else if (/android/i.test(source)) {
    // Android sem a palavra Mobile geralmente é tablet
    deviceType = "Tablet";
  }

  // 2. Detecção de Sistema Operacional (precedência: específicos antes de genéricos)
  if (/Windows NT|Windows/i.test(source)) {
    os = "Windows";
  } else if (/iPad/i.test(source)) {
    os = "iPadOS";
  } else if (/iPhone|iPod/i.test(source)) {
    os = "iOS";
  } else if (/Android/i.test(source)) {
    os = "Android";
  } else if (/CrOS/i.test(source)) {
    os = "ChromeOS";
  } else if (/Macintosh|Mac OS X/i.test(source)) {
    os = "macOS";
  } else if (/Linux/i.test(source)) {
    os = "Linux";
  }

  // 3. Detecção de Navegador com precedência rigorosa
  // Precedência essencial:
  // Opera > Edge > Samsung Internet > Brave (se sinal presente) > Firefox > Chrome/Chromium > Safari
  if (/OPR\/|Opera\//i.test(source)) {
    browser = "Opera";
  } else if (/Edg\/|Edge\//i.test(source)) {
    browser = "Edge";
  } else if (/SamsungBrowser\//i.test(source)) {
    browser = "Samsung Internet";
  } else if (/\bBrave\b/i.test(source)) {
    // Brave: identificado quando há sinal confiável (label/UA).
    // Quando não houver sinal explícito, identifica legitimamente como Chrome/Chromium sem fingerprinting invasivo.
    browser = "Brave";
  } else if (/Firefox\/|FxiOS\//i.test(source)) {
    browser = "Firefox";
  } else if (/Chrome\/|Chromium\/|CriOS\//i.test(source)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(source) && !/Chrome|Chromium|CriOS|Android|OPR\/|Edg\//i.test(source)) {
    browser = "Safari";
  }

  // 4. Montagem do título de apresentação
  let displayTitle = "";
  if (browser && os) {
    displayTitle = `${browser} · ${os}`;
  } else if (browser) {
    displayTitle = `${browser} · ${deviceType}`;
  } else if (os) {
    displayTitle = `${deviceType} · ${os}`;
  } else if (
    label &&
    !/^(desktop|mobile|tablet|unknown|desconhecido|generic|dispositivo desconhecido|navegador web|sistema operacional)$/i.test(
      label.trim()
    )
  ) {
    displayTitle = label;
  } else {
    displayTitle = deviceType;
  }

  return {
    browser,
    os,
    deviceType,
    displayTitle,
  };
}
