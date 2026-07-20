/**
 * NIA — separação definitiva CONTENT × ACTIONS.
 *
 * content  → texto natural para o usuário
 * actions  → CTAs estruturados para a UI (nunca concatenados ao content)
 *
 * O modelo NÃO deve escrever JSON de actions no texto.
 * Parser + allowlist + sanitização garantem zero vazamento.
 */

import { ASSISTANT_NAV_REGISTRY } from "./nav-registry";
import { NAV_ROUTE_ID_TO_HREF } from "./nia-navigation-catalog";

/** Espelho do tipo de ação da NIA (evita import circular com index). */
export type NiaAction = {
  type: "navigate" | "tour" | "docs" | "support";
  label: string;
  href?: string;
  id?: string;
};

/** routeIds semânticos → href real (derivado do Navigation Catalog). */
export const NIA_ROUTE_ID_MAP: Record<string, string> = {
  ...NAV_ROUTE_ID_TO_HREF,
  plan: "/app/settings",
};

/** Alias de labels → routeId (quando o modelo inventa href em prosa). */
const LABEL_TO_ROUTE_ID: Array<{ re: RegExp; routeId: string }> = [
  { re: /agente|ai\b|aprendizado/i, routeId: "agents" },
  { re: /conheciment/i, routeId: "knowledge" },
  { re: /canal|whatsapp|integra/i, routeId: "channels" },
  { re: /funil|crm|pipeline|oportun/i, routeId: "funnel" },
  { re: /conversa|inbox|atendiment/i, routeId: "conversations" },
  { re: /contato/i, routeId: "contacts" },
  { re: /tarefa/i, routeId: "tasks" },
  { re: /campanha/i, routeId: "campaigns" },
  { re: /fluxo|automa/i, routeId: "flows" },
  { re: /equipe|time|membro/i, routeId: "team" },
  { re: /relat[oó]rio/i, routeId: "reports" },
  { re: /webhook/i, routeId: "webhooks" },
  { re: /\bapi\b|chave/i, routeId: "api" },
  { re: /seguran[cç]a|senha|mfa|2fa/i, routeId: "security" },
  { re: /sess[aã]o/i, routeId: "sessions" },
  { re: /prefer/i, routeId: "preferences" },
  { re: /conta/i, routeId: "account" },
  { re: /configura|plano|cobran/i, routeId: "settings" },
  { re: /novidade/i, routeId: "whats_new" },
];

export type RawNiaAction = {
  type?: string;
  label?: string;
  href?: string;
  routeId?: string;
  id?: string;
};

/** Resolve routeId semântico para href canônico (ou null se desconhecido). */
export function resolveRouteId(routeId: string | undefined | null): string | null {
  if (!routeId || typeof routeId !== "string") return null;
  const key = routeId.trim().toLowerCase().replace(/\s+/g, "_");
  if (!key) return null;
  if (NIA_ROUTE_ID_MAP[key]) return NIA_ROUTE_ID_MAP[key];
  // id do registry
  const nav = ASSISTANT_NAV_REGISTRY.find((n) => n.id === key || n.id === routeId.trim());
  return nav?.href ?? null;
}

/** Mapeia label → href candidato (só se o label for de UI conhecido). */
export function resolveHrefFromLabel(label: string | undefined | null): string | null {
  if (!label) return null;
  for (const { re, routeId } of LABEL_TO_ROUTE_ID) {
    if (re.test(label)) return resolveRouteId(routeId);
  }
  return null;
}

/**
 * Mapeia href inventado do modelo para a allowlist (prefixo mais longo vence).
 * Rejeita javascript:/data:/file: e prosa não-path.
 */
export function resolveAllowedHref(
  href: string | undefined | null,
  allowedHrefs: Set<string>
): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h) return null;

  // Schemes proibidos
  if (/^(javascript|data|file|vbscript):/i.test(h)) return null;

  // Prosa / href inventado (ex.: "a área correspondente na NexaFlow")
  if (!h.startsWith("/") && !/^https?:\/\//i.test(h)) {
    return null;
  }

  // Só paths internos allowlisted (nunca URL externa arbitrária como navigate)
  if (/^https?:\/\//i.test(h)) {
    // mailto support action é tratado noutro fluxo; navigate/docs não aceita URL absoluta
    return null;
  }

  if (allowedHrefs.has(h)) return h;

  const candidates = [...allowedHrefs].sort((a, b) => b.length - a.length);
  for (const a of candidates) {
    if (h === a || h.startsWith(a + "/")) return a;
  }

  // Fallbacks por trecho de path
  if (/knowledge|conhec/i.test(h) && allowedHrefs.has("/app/knowledge")) return "/app/knowledge";
  if (/\/ai|agent/i.test(h) && allowedHrefs.has("/app/ai")) return "/app/ai";
  if (/integrat|channel|whatsapp|canal/i.test(h) && allowedHrefs.has("/app/integrations"))
    return "/app/integrations";
  if (/crm|funil|pipeline/i.test(h) && allowedHrefs.has("/app/crm")) return "/app/crm";
  if (/inbox|conversa/i.test(h) && allowedHrefs.has("/app/inbox")) return "/app/inbox";
  if (/settings\/api|\/api/i.test(h) && allowedHrefs.has("/app/settings/api"))
    return "/app/settings/api";
  if (/webhook/i.test(h) && allowedHrefs.has("/app/settings/webhooks"))
    return "/app/settings/webhooks";
  if (/settings|config/i.test(h) && allowedHrefs.has("/app/settings")) return "/app/settings";
  if (/account\/security|senha|mfa/i.test(h) && allowedHrefs.has("/app/account/security"))
    return "/app/account/security";
  if (/account\/sessions/i.test(h) && allowedHrefs.has("/app/account/sessions"))
    return "/app/account/sessions";
  if (/account/i.test(h) && allowedHrefs.has("/app/account")) return "/app/account";
  if (/whats-new|novidade/i.test(h) && allowedHrefs.has("/app/whats-new")) return "/app/whats-new";

  return null;
}

/** Valida e normaliza uma action bruta; inválida → null (falha silenciosa). */
export function normalizeNiaAction(
  raw: RawNiaAction,
  allowedHrefs: Set<string>
): NiaAction | null {
  if (!raw || typeof raw !== "object") return null;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label || label.length > 80) return null;

  const type = (raw.type || "navigate").toLowerCase();

  if (type === "tour") {
    return { type: "tour", label, id: raw.id || "platform-tour" };
  }
  if (type === "support") {
    return { type: "support", label };
  }

  // Prefer routeId → href allowlisted
  let candidate: string | null = null;
  if (raw.routeId) {
    candidate = resolveRouteId(raw.routeId);
  }
  if (!candidate && raw.href) {
    candidate = raw.href.trim();
  }
  // href em prosa / inventado → tenta pelo label
  if (!candidate || (!candidate.startsWith("/") && !candidate.startsWith("http"))) {
    candidate = resolveHrefFromLabel(label) || candidate;
  }

  const resolved = resolveAllowedHref(candidate, allowedHrefs);
  if (!resolved) return null;

  const safeLabel = label.length > 48 ? label.slice(0, 45).trim() + "…" : label;
  return {
    type: resolved.startsWith("/docs/") ? "docs" : "navigate",
    label: safeLabel,
    href: resolved,
  };
}

/**
 * Assinatura de action estruturada da NIA (não JSON genérico de API/código).
 * Exige type ∈ navigate|tour|docs|support — não basta "type"/"href" sozinhos.
 */
const NIA_ACTION_TYPE_RE = /"(?:type)"\s*:\s*"(?:navigate|tour|docs|support)"/i;

/** Payload JSON que parece action NIA (objeto ou array de objetos). */
function looksLikeNiaActionPayload(jsonish: string): boolean {
  const s = (jsonish || "").trim();
  if (!s || !NIA_ACTION_TYPE_RE.test(s)) return false;
  // Evita JSON schema / payloads de produto que só citam type
  // Actions NIA quase sempre têm label, href ou routeId
  if (/"label"\s*:/i.test(s) || /"href"\s*:/i.test(s) || /"routeId"\s*:/i.test(s)) {
    return true;
  }
  // tour/support às vezes só type+label — type navigate sem label/href é fraco: não strip
  return /"type"\s*:\s*"(?:tour|support)"/i.test(s);
}

/**
 * Detecta vazamento de actions estruturadas no content.
 * Defesa em profundidade — a barreira principal é content × actions separados.
 * NÃO sinaliza JSON genérico, schemas de API, nem a palavra "ações" em prosa.
 */
export function contentHasActionLeakage(text: string): boolean {
  if (!text) return false;
  const t = text;

  // Bloco rotulado + JSON de action NIA
  // Ex.: Ações: [{"type":"navigate",...}]  |  ACTIONS: {...}
  if (/(?:ACTIONS?|A[CÇ][OÕ]ES)\s*:\s*[\[{]/i.test(t) && NIA_ACTION_TYPE_RE.test(t)) {
    return true;
  }

  // Objeto/array cru com type de action da NIA
  if (NIA_ACTION_TYPE_RE.test(t) && (/"label"\s*:/i.test(t) || /"href"\s*:/i.test(t) || /"routeId"\s*:/i.test(t))) {
    return true;
  }

  return false;
}

/**
 * Remove só vazamento de actions estruturadas da NIA no texto.
 *
 * Defesa adicional — NÃO é a barreira principal (isso é content × actions separados).
 * NÃO apaga conteúdo legítimo sobre JSON, APIs, webhooks, código ou a palavra "ações".
 */
export function stripActionLeakageFromText(raw: string): string {
  let content = (raw || "").replace(/\r\n/g, "\n");

  // 0) Vazamento residual com href em prosa (ex.: "href":"Configurações")
  // O modelo NÃO deve gerar actions; se vazar, remove bloco inteiro.
  content = content.replace(
    /\(?\s*\[?\s*(?:ACTIONS?|A[CÇ][OÕ]ES)\s*:\s*\[[\s\S]{0,800}?\]\s*\]?\s*\)?/gi,
    (full) =>
      /"type"\s*:\s*"(?:navigate|tour|docs|support)"/i.test(full) ||
      /"href"\s*:/i.test(full) ||
      /"routeId"\s*:/i.test(full)
        ? ""
        : full
  );

  // 1) Blocos rotulados EN/PT + payload JSON — só se for action NIA
  // Exato do bug: (Ações: [{"type":"navigate",...}])
  //               ACTIONS: [...]
  //               [ACTIONS: {...}]
  content = content.replace(
    /\(?\s*\[?\s*(?:ACTIONS?|A[CÇ][OÕ]ES)\s*:\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*\]?\s*\)?/gi,
    (full, payload: string) => (looksLikeNiaActionPayload(payload) ? "" : full)
  );

  // 2) Objetos/arrays crus com type de action NIA (sem rótulo)
  // Não remove {"type":"object"} nem payloads de API com type/message
  content = content.replace(
    /\[\s*\{\s*"type"\s*:\s*"(?:navigate|tour|docs|support)"[\s\S]*?\}\s*(?:,\s*\{\s*"type"\s*:\s*"(?:navigate|tour|docs|support)"[\s\S]*?\}\s*)*\]/gi,
    (full) => (looksLikeNiaActionPayload(full) ? "" : full)
  );
  content = content.replace(
    /\{\s*"type"\s*:\s*"(?:navigate|tour|docs|support)"[\s\S]*?\}/gi,
    (full) => (looksLikeNiaActionPayload(full) ? "" : full)
  );

  // 3) Links markdown internos /app|/docs → só o label (CTA fica no campo actions)
  content = content.replace(
    /\[([^\]]+)\]\(\s*(\/app\/[^)\s]+|\/docs\/[^)\s]+)\s*\)/gi,
    "$1"
  );

  // 4) Dump de UI "Ações sugeridas:" (não confundir com prosa "Ações do fluxo")
  content = content.replace(
    /\n*(?:#{1,3}\s*)?(?:A[cç][oõ]es\s+sugeridas|Pr[oó]ximos\s+passos\s+na\s+interface|Links?\s+[uú]teis)\s*:?\s*\n(?:[-*•]\s*.+\n?){0,8}/gi,
    "\n"
  );

  // 5) CTA textual residual só no padrão "clique em Abrir <Módulo>" (rótulo de botão NIA)
  content = content.replace(
    /(?:^|[.!?]\s*|,\s*)(?:clique|toque)\s+em\s+[“"']?Abrir\s+[A-Za-zÀ-ú][^“"'.!?\n]{0,32}[“"']?/gi,
    (m) => (m.startsWith(".") || m.startsWith("!") || m.startsWith("?") ? m[0] : "")
  );

  // 6) Limpeza leve de pontuação/espaços após remoções (não reescreve prosa)
  content = content.replace(/[ \t]+\n/g, "\n");
  content = content.replace(/\(\s*\)/g, "");
  content = content.replace(/[ \t]{2,}/g, " ");
  content = content.replace(/\n{3,}/g, "\n\n");
  content = content.replace(/\s+([.,;:!?])/g, "$1");
  content = content.trim();

  // 7) Segunda passagem estreita se ainda houver assinatura de action NIA
  if (contentHasActionLeakage(content)) {
    content = content
      .replace(
        /\(?\s*\[?\s*(?:ACTIONS?|A[CÇ][OÕ]ES)\s*:\s*(?:\[[\s\S]*?\]|\{[\s\S]*?\})\s*\]?\s*\)?/gi,
        (full) => (NIA_ACTION_TYPE_RE.test(full) ? "" : full)
      )
      .replace(
        /\{\s*"type"\s*:\s*"(?:navigate|tour|docs|support)"[^{}]*\}/gi,
        (full) => (looksLikeNiaActionPayload(full) ? "" : full)
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return content;
}

/**
 * Extrai actions de um bloco de texto do modelo (legado) e devolve content limpo.
 * Preferência de arquitetura: actions vêm de ensureContextualCta, não do modelo.
 * Este parser só captura residual se o modelo ainda emitir o formato antigo.
 */
export function extractActionsFromModelText(
  raw: string,
  allowedHrefs: Set<string>
): { actions: NiaAction[]; stripped: string } {
  const actions: NiaAction[] = [];
  let working = raw || "";

  const blockRe =
    /\(?\s*\[?\s*(?:ACTIONS?|A[CÇ][OÕ]ES)\s*:\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*\]?\s*\)?/gi;
  let block: RegExpExecArray | null;
  const jsonChunks: string[] = [];
  while ((block = blockRe.exec(working)) !== null) {
    jsonChunks.push(block[1]);
  }

  for (const chunk of jsonChunks) {
    try {
      const parsed = JSON.parse(chunk) as RawNiaAction | RawNiaAction[];
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const a of list) {
        const n = normalizeNiaAction(a, allowedHrefs);
        if (n && !actions.some((x) => (x.href || x.type + x.label) === (n.href || n.type + n.label))) {
          actions.push(n);
        }
      }
    } catch {
      /* JSON inválido — só sanitiza */
    }
  }

  // Markdown internos → ações
  const mdLinkRe = /\[([^\]]+)\]\(\s*((?:\/app\/|\/docs\/)[^)\s]+)\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRe.exec(working)) !== null) {
    const n = normalizeNiaAction(
      {
        type: m[2].startsWith("/docs/") ? "docs" : "navigate",
        label: m[1].trim().length > 40 ? "Abrir" : m[1].trim(),
        href: m[2].trim(),
      },
      allowedHrefs
    );
    if (n && !actions.some((x) => x.href === n.href)) {
      actions.push(n);
    }
  }

  const stripped = stripActionLeakageFromText(working);
  return { actions, stripped };
}

/**
 * Composer canônico: content limpo + actions validadas.
 * Nunca concatena actions ao content.
 */
export function composeNiaResponse(params: {
  rawContent: string;
  /** Actions já estruturadas (preferencial) */
  structuredActions?: NiaAction[];
  allowedHrefs: Set<string>;
  /** Pós-processamento de paths inventados no texto (opcional) */
  rewritePaths?: (text: string) => string;
  filterActions?: (actions: NiaAction[]) => NiaAction[];
}): { content: string; actions: NiaAction[] } {
  const extracted = extractActionsFromModelText(params.rawContent, params.allowedHrefs);

  let content = extracted.stripped;
  if (params.rewritePaths) {
    content = params.rewritePaths(content);
    // rewritePaths não deve reintroduzir leakage; re-strip leve
    content = stripActionLeakageFromText(content);
  }

  const merged: NiaAction[] = [];
  const push = (a: NiaAction) => {
    const key = a.href || a.type + a.label;
    if (merged.some((x) => (x.href || x.type + x.label) === key)) return;
    // Re-valida navigate/docs
    if (a.type === "navigate" || a.type === "docs") {
      const n = normalizeNiaAction(
        { type: a.type, label: a.label, href: a.href, routeId: undefined, id: a.id },
        params.allowedHrefs
      );
      if (n) merged.push(n);
      return;
    }
    if (a.type === "tour" || a.type === "support") {
      merged.push({ type: a.type, label: a.label, id: a.id, href: a.href });
    }
  };

  for (const a of params.structuredActions || []) push(a);
  for (const a of extracted.actions) push(a);

  let actions = params.filterActions ? params.filterActions(merged) : merged.slice(0, 2);

  // Garantia final: content sem leakage
  if (contentHasActionLeakage(content)) {
    content = stripActionLeakageFromText(content);
  }

  // Nunca serializar actions de volta
  if (content.includes(JSON.stringify(actions))) {
    content = content.split(JSON.stringify(actions)).join("").trim();
  }

  return { content: content.trim(), actions };
}
