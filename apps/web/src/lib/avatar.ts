/** Tipos e helpers de avatar do usuário (cliente) */

export type AvatarType = "UPLOAD" | "INITIALS" | "NEXA_AVATAR";

export type AvatarUser = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  avatarType?: AvatarType | string | null;
  avatarPresetId?: string | null;
  avatarColor?: string | null;
};

export const AVATAR_COLOR_OPTIONS = [
  { id: "violet", hex: "#6366F1", label: "Violeta" },
  { id: "indigo", hex: "#4F46E5", label: "Índigo" },
  { id: "blue", hex: "#3B82F6", label: "Azul" },
  { id: "purple", hex: "#8B5CF6", label: "Roxo" },
  { id: "slate", hex: "#64748B", label: "Ardósia" },
] as const;

/** Iniciais: primeiro + último nome; 1 nome → até 2 letras */
export function userInitials(name?: string | null, email?: string | null): string {
  const raw = (name || "").trim();
  if (raw) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  }
  const local = (email || "").split("@")[0] || "?";
  return local.slice(0, 2).toUpperCase();
}

export function resolveAvatarColor(color?: string | null): string {
  if (!color) return AVATAR_COLOR_OPTIONS[0].hex;
  const byId = AVATAR_COLOR_OPTIONS.find((c) => c.id === color.toLowerCase());
  if (byId) return byId.hex;
  if (/^#?[0-9a-f]{6}$/i.test(color)) {
    return color.startsWith("#") ? color : `#${color}`;
  }
  return AVATAR_COLOR_OPTIONS[0].hex;
}

/**
 * Resolve URL de mídia:
 * - /nexa-avatars/* → estático do Next
 * - /media/* → proxy da API
 */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("blob:") || /^https?:\/\//i.test(url)) {
    return url;
  }
  if (url.startsWith("/nexa-avatars/")) return url;
  if (url.startsWith("/media/")) return `/nexa-api${url}`;
  if (url.startsWith("nexa-") && !url.includes("/")) {
    return `/nexa-avatars/${url}.svg`;
  }
  return url;
}

export function presetUrl(presetId: string): string {
  return `/nexa-avatars/${presetId}.svg`;
}

/**
 * Prioridade de exibição:
 * 1. UPLOAD com url
 * 2. NEXA_AVATAR com preset
 * 3. INITIALS
 * 4. fallback nexa-core
 */
export function resolveAvatarPresentation(user: AvatarUser): {
  mode: "image" | "initials";
  src?: string;
  initials: string;
  color: string;
  alt: string;
} {
  const initials = userInitials(user.name, user.email);
  const color = resolveAvatarColor(user.avatarColor);
  const alt = user.name?.trim() || user.email || "Usuário";
  const type = (user.avatarType || "INITIALS") as AvatarType;

  if (type === "UPLOAD") {
    const src = resolveMediaUrl(user.avatarUrl);
    if (src) return { mode: "image", src, initials, color, alt };
  }

  if (type === "NEXA_AVATAR") {
    const id = user.avatarPresetId;
    const src =
      resolveMediaUrl(user.avatarUrl) ||
      (id ? presetUrl(id) : null) ||
      presetUrl("nexa-core-01");
    return { mode: "image", src, initials, color, alt };
  }

  // INITIALS ou fallback
  if (user.avatarUrl && type !== "INITIALS") {
    const src = resolveMediaUrl(user.avatarUrl);
    if (src) return { mode: "image", src, initials, color, alt };
  }

  return { mode: "initials", initials, color, alt };
}

/** Crop + resize centrado para quadrado (canvas) → JPEG data URL */
export async function processAvatarFile(file: File, edge = 512): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) {
    throw new Error("Use JPEG, PNG ou WebP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("A foto excede o limite de 5 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  if (size < 32) {
    bitmap.close();
    throw new Error("Imagem muito pequena.");
  }
  const sx = Math.floor((bitmap.width - size) / 2);
  const sy = Math.floor((bitmap.height - size) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Não foi possível processar a imagem.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, edge, edge);
  bitmap.close();

  // WebP se suportado; senão JPEG
  const webp = canvas.toDataURL("image/webp", 0.88);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", 0.9);
}
