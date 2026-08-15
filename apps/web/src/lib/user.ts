/**
 * Utilitários para apresentação e resolução de dados de perfil do usuário.
 */

export interface UserIdentifiable {
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
}

/**
 * Resolução centralizada do nome de exibição do usuário.
 * Fallback prioritário: displayName (se preenchido) → name → prefixo do e-mail → "Usuário".
 */
export function getUserDisplayName(user?: UserIdentifiable | null): string {
  if (!user) return "";
  const display = user.displayName?.trim();
  if (display) return display;
  const name = user.name?.trim();
  if (name) return name;
  if (user.email && user.email.includes("@")) {
    const local = user.email.split("@")[0].trim();
    if (local) return local;
  }
  return "Usuário";
}

export interface TimezoneOption {
  value: string;
  label: string;
  group: "Brasil" | "América Latina" | "América do Norte" | "Europa" | "Outros";
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // Brasil
  { value: "America/Sao_Paulo", label: "Brasília / São Paulo (GMT-3)", group: "Brasil" },
  { value: "America/Manaus", label: "Manaus / Amazonas (GMT-4)", group: "Brasil" },
  { value: "America/Cuiaba", label: "Cuiabá / Mato Grosso (GMT-4)", group: "Brasil" },
  { value: "America/Belem", label: "Belém / Pará (GMT-3)", group: "Brasil" },
  { value: "America/Fortaleza", label: "Fortaleza / Nordeste (GMT-3)", group: "Brasil" },
  { value: "America/Recife", label: "Recife / Pernambuco (GMT-3)", group: "Brasil" },
  { value: "America/Bahia", label: "Salvador / Bahia (GMT-3)", group: "Brasil" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)", group: "Brasil" },
  { value: "America/Rio_Branco", label: "Rio Branco / Acre (GMT-5)", group: "Brasil" },
  { value: "America/Porto_Velho", label: "Porto Velho / Rondônia (GMT-4)", group: "Brasil" },
  { value: "America/Boa_Vista", label: "Boa Vista / Roraima (GMT-4)", group: "Brasil" },
  { value: "America/Campo_Grande", label: "Campo Grande / MS (GMT-4)", group: "Brasil" },

  // América Latina
  { value: "America/Buenos_Aires", label: "Buenos Aires (GMT-3)", group: "América Latina" },
  { value: "America/Santiago", label: "Santiago (GMT-4)", group: "América Latina" },
  { value: "America/Bogota", label: "Bogotá (GMT-5)", group: "América Latina" },
  { value: "America/Lima", label: "Lima (GMT-5)", group: "América Latina" },
  { value: "America/Montevideo", label: "Montevidéu (GMT-3)", group: "América Latina" },
  { value: "America/Mexico_City", label: "Cidade do México (GMT-6)", group: "América Latina" },

  // América do Norte
  { value: "America/New_York", label: "Nova York / Leste (GMT-5)", group: "América do Norte" },
  { value: "America/Chicago", label: "Chicago / Central (GMT-6)", group: "América do Norte" },
  { value: "America/Denver", label: "Denver / Montanhas (GMT-7)", group: "América do Norte" },
  { value: "America/Los_Angeles", label: "Los Angeles / Pacífico (GMT-8)", group: "América do Norte" },

  // Europa
  { value: "Europe/Lisbon", label: "Lisboa / Portugal (GMT+0)", group: "Europa" },
  { value: "Europe/Madrid", label: "Madri / Espanha (GMT+1)", group: "Europa" },
  { value: "Europe/London", label: "Londres / Reino Unido (GMT+0)", group: "Europa" },
  { value: "Europe/Paris", label: "Paris / França (GMT+1)", group: "Europa" },
  { value: "Europe/Berlin", label: "Berlim / Alemanha (GMT+1)", group: "Europa" },

  // Outros
  { value: "UTC", label: "UTC (Tempo Universal Coordenado)", group: "Outros" },
];

/**
 * Detecta o fuso horário atual do dispositivo.
 */
export function getDetectedTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    /* ignore */
  }
  return "America/Sao_Paulo";
}

/**
 * Formata data no fuso horário do usuário.
 */
export function formatInUserTimezone(
  date: Date | string | number,
  timezone?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
    const tz = timezone || getDetectedTimezone();
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    }).format(d);
  } catch {
    return String(date);
  }
}
