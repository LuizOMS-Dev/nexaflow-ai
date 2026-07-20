/** Rotas e tipos do Assistente NexaFlow (espelho leve do backend). */

export type AssistantAction = {
  type: "navigate" | "tour" | "docs" | "support";
  label: string;
  href?: string;
  id?: string;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  /** Texto natural — NUNCA deve conter JSON de actions */
  content: string;
  /** CTAs estruturados renderizados fora da bolha de texto */
  actions?: AssistantAction[] | null;
  feedback?: string | null;
  createdAt?: string;
};

/** Schemes e hrefs proibidos para navigate/docs no cliente. */
function isSafeInternalHref(href: string | undefined): boolean {
  if (!href || typeof href !== "string") return false;
  const h = href.trim();
  if (!h.startsWith("/")) return false;
  if (/^(javascript|data|file|vbscript):/i.test(h)) return false;
  // Só paths do app / docs
  if (!(h.startsWith("/app") || h.startsWith("/docs"))) return false;
  return true;
}

/**
 * Filtra actions inválidas no cliente (falha silenciosa — sem botão quebrado).
 * Nunca serializa actions de volta ao content.
 */
export function sanitizeAssistantActions(raw: unknown): AssistantAction[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: AssistantAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as AssistantAction;
    const label = typeof a.label === "string" ? a.label.trim() : "";
    if (!label) continue;
    const type = (a.type || "navigate") as AssistantAction["type"];
    if (type === "tour") {
      if (!out.some((x) => x.type === "tour")) {
        out.push({ type: "tour", label, id: a.id || "platform-tour" });
      }
      continue;
    }
    if (type === "support") {
      if (!out.some((x) => x.type === "support")) {
        const href =
          typeof a.href === "string" && a.href.startsWith("mailto:") ? a.href : undefined;
        out.push({ type: "support", label, href });
      }
      continue;
    }
    if (type === "navigate" || type === "docs") {
      if (!isSafeInternalHref(a.href)) continue;
      // Rejeita href em prosa (legado)
      if (/área correspondente|nexaflow/i.test(a.href!) && !a.href!.startsWith("/")) continue;
      if (out.some((x) => x.href === a.href)) continue;
      out.push({
        type: a.href!.startsWith("/docs/") ? "docs" : "navigate",
        label: label.length > 48 ? label.slice(0, 45) + "…" : label,
        href: a.href,
      });
    }
  }
  return out.slice(0, 3);
}

export type AssistantBootstrap = {
  enabled: boolean;
  name: string;
  subtitle: string;
  online?: boolean;
  unstable?: boolean;
  statusMessage?: string | null;
  welcome?: string;
  /** session = painel autenticado (não pede e-mail) */
  identityMode?: "session" | "external_pending";
  user?: { firstName?: string | null };
  company?: { name?: string | null };
  currentRoute: string;
  currentModule: string;
  currentPageTitle: string;
  suggestions: string[];
  allowedNav: Array<{ id: string; href: string; label: string }>;
  support: { available: boolean; email?: string };
  operational: {
    whatsappStatus: string;
    agentCount: number;
    planName: string | null;
    apiEnabled: boolean;
  } | null;
  thread: {
    id: string;
    title?: string | null;
    messages: AssistantMessage[];
  } | null;
};

export const ASSISTANT_OPEN_EVENT = "nexaflow:open-assistant";

export function openNexaflowAssistant() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT));
}
