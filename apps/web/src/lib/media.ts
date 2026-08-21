/**
 * Utilitários para resolução e manipulação de mídias no frontend do NexaFlow.
 */

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // URLs de dados, blobs e absolutas permanecem intactas
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }

  // Avatares estáticos
  if (trimmed.startsWith("/nexa-avatars/")) return trimmed;
  if (trimmed.startsWith("nexa-") && !trimmed.includes("/")) {
    return `/nexa-avatars/${trimmed}.svg`;
  }

  // Mídias do backend (/media/... ou /api/media/...)
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  const base = apiUrl.startsWith("http") || apiUrl.startsWith("/") ? apiUrl : "/nexa-api";

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (normalized.startsWith("/api/media/")) {
    const subPath = normalized.replace(/^\/api/, "");
    return base === "/nexa-api" ? `/nexa-api${subPath}` : `${base}${subPath}`;
  }

  if (normalized.startsWith("/media/")) {
    return base === "/nexa-api" ? `/nexa-api${normalized}` : `${base}${normalized}`;
  }

  if (normalized.startsWith("/nexa-api/")) {
    return normalized;
  }

  return normalized;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSeconds(secs?: number | null): string {
  if (secs === undefined || secs === null || isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type FileStyle = {
  label: string;
  ext: string;
  badgeBg: string;
  badgeText: string;
  iconColor: string;
};

export function getFileStyle(filename?: string, mimetype?: string): FileStyle {
  const name = filename || "";
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() || "" : "";
  const mime = (mimetype || "").toLowerCase();

  if (ext === "pdf" || mime.includes("pdf")) {
    return {
      label: "PDF",
      ext: "PDF",
      badgeBg: "bg-red-500/10 dark:bg-red-500/20",
      badgeText: "text-red-600 dark:text-red-300",
      iconColor: "text-red-500 dark:text-red-400",
    };
  }

  if (
    ext === "doc" ||
    ext === "docx" ||
    mime.includes("word") ||
    mime.includes("document")
  ) {
    return {
      label: "Word",
      ext: ext ? ext.toUpperCase() : "DOCX",
      badgeBg: "bg-blue-500/10 dark:bg-blue-500/20",
      badgeText: "text-blue-600 dark:text-blue-300",
      iconColor: "text-blue-500 dark:text-blue-400",
    };
  }

  if (
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "csv" ||
    mime.includes("sheet") ||
    mime.includes("excel") ||
    mime.includes("csv")
  ) {
    return {
      label: ext === "csv" ? "CSV" : "Excel",
      ext: ext ? ext.toUpperCase() : "XLSX",
      badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
      badgeText: "text-emerald-600 dark:text-emerald-300",
      iconColor: "text-emerald-500 dark:text-emerald-400",
    };
  }

  if (
    ext === "ppt" ||
    ext === "pptx" ||
    mime.includes("presentation") ||
    mime.includes("powerpoint")
  ) {
    return {
      label: "Apresentação",
      ext: ext ? ext.toUpperCase() : "PPTX",
      badgeBg: "bg-orange-500/10 dark:bg-orange-500/20",
      badgeText: "text-orange-600 dark:text-orange-300",
      iconColor: "text-orange-500 dark:text-orange-400",
    };
  }

  if (
    ext === "zip" ||
    ext === "rar" ||
    ext === "7z" ||
    ext === "tar" ||
    ext === "gz" ||
    mime.includes("zip") ||
    mime.includes("compressed")
  ) {
    return {
      label: "Arquivo",
      ext: ext ? ext.toUpperCase() : "ZIP",
      badgeBg: "bg-amber-500/10 dark:bg-amber-500/20",
      badgeText: "text-amber-600 dark:text-amber-300",
      iconColor: "text-amber-500 dark:text-amber-400",
    };
  }

  if (
    ext === "txt" ||
    ext === "rtf" ||
    ext === "json" ||
    mime.includes("text") ||
    mime.includes("json")
  ) {
    return {
      label: "Texto",
      ext: ext ? ext.toUpperCase() : "TXT",
      badgeBg: "bg-zinc-500/10 dark:bg-zinc-500/20",
      badgeText: "text-zinc-600 dark:text-zinc-300",
      iconColor: "text-zinc-500 dark:text-zinc-400",
    };
  }

  return {
    label: "Documento",
    ext: ext ? ext.toUpperCase() : "ARQUIVO",
    badgeBg: "bg-sky-500/10 dark:bg-sky-500/20",
    badgeText: "text-sky-600 dark:text-sky-300",
    iconColor: "text-sky-500 dark:text-sky-400",
  };
}
