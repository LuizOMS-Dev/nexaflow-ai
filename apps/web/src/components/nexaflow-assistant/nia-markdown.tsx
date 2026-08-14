/**
 * Markdown seguro e leve para bolhas da NIA.
 * - **negrito**, *itálico*, listas, parágrafos
 * - links externos http(s) com rel noopener
 * - links /app e /docs viram texto (ações estruturadas na UI)
 * - sem HTML cru / scripts
 */
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline: bold, italic, code, links */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokeniza de forma linear
  const re =
    /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${i++}`}>{text.slice(last, m.index)}</Fragment>
      );
    }
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-inherit">
          {m[2]}
        </strong>
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <em key={`${keyPrefix}-i-${i++}`} className="italic">
          {m[3]}
        </em>
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i++}`}
          className="rounded bg-black/[0.06] px-1 py-0.5 text-[0.9em] dark:bg-white/[0.08]"
        >
          {m[4]}
        </code>
      );
    } else if (m[5] !== undefined && m[6] !== undefined) {
      const label = m[5];
      const href = m[6].trim();
      if (/^https?:\/\//i.test(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-a-${i++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-brand-500/40 underline-offset-2 hover:decoration-brand-500"
          >
            {label}
          </a>
        );
      } else {
        // Interno: só label (CTA estruturado)
        nodes.push(<Fragment key={`${keyPrefix}-il-${i++}`}>{label}</Fragment>);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-e`}>{text.slice(last)}</Fragment>);
  }
  return nodes.length ? nodes : [text];
}

/**
 * Defesa em profundidade no cliente: remove só vazamento de actions da NIA.
 * Backend já separa content × actions — aqui não se apaga JSON/API/código legítimos.
 * Assinatura exigida: type ∈ navigate|tour|docs|support (+ label/href/routeId).
 */
export function stripNiaActionLeakage(text: string): string {
  let content = (text || "").replace(/\r\n/g, "\n");

  const isNiaActionPayload = (payload: string) => {
    if (!/"(?:type)"\s*:\s*"(?:navigate|tour|docs|support)"/i.test(payload)) return false;
    return (
      /"label"\s*:/i.test(payload) ||
      /"href"\s*:/i.test(payload) ||
      /"routeId"\s*:/i.test(payload) ||
      /"type"\s*:\s*"(?:tour|support)"/i.test(payload)
    );
  };

  // EN/PT rotulado + JSON de action: (Ações: [{"type":"navigate",...}])
  content = content.replace(
    /\(?\s*\[?\s*(?:ACTIONS?|A[CÇ][OÕ]ES)\s*:\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*\]?\s*\)?/gi,
    (full, payload: string) => (isNiaActionPayload(payload) ? "" : full)
  );

  // JSON cru com type de action NIA
  content = content.replace(
    /\[\s*\{\s*"type"\s*:\s*"(?:navigate|tour|docs|support)"[\s\S]*?\}\s*(?:,\s*\{\s*"type"\s*:\s*"(?:navigate|tour|docs|support)"[\s\S]*?\}\s*)*\]/gi,
    (full) => (isNiaActionPayload(full) ? "" : full)
  );
  content = content.replace(
    /\{\s*"type"\s*:\s*"(?:navigate|tour|docs|support)"[\s\S]*?\}/gi,
    (full) => (isNiaActionPayload(full) ? "" : full)
  );

  content = content.replace(/\(\s*\)/g, "");
  content = content.replace(/[ \t]{2,}/g, " ");
  content = content.replace(/\n{3,}/g, "\n\n");
  content = content.replace(/\s+([.,;:!?])/g, "$1");
  return content.trim();
}

export function NiaMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const raw = stripNiaActionLeakage((content || "").replace(/\r\n/g, "\n"));
  if (!raw) return null;

  const lines = raw.split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: { ordered: boolean; items: string[] } | null = null;
  let pBuf: string[] = [];
  let bi = 0;

  function flushP() {
    if (!pBuf.length) return;
    const text = pBuf.join(" ").trim();
    pBuf = [];
    if (!text) return;
    blocks.push(
      <p key={`p-${bi++}`} className="nf-nia-md-p">
        {renderInline(text, `p${bi}`)}
      </p>
    );
  }

  function flushList() {
    if (!listBuf || !listBuf.items.length) {
      listBuf = null;
      return;
    }
    const Tag = listBuf.ordered ? "ol" : "ul";
    const cls = listBuf.ordered ? "nf-nia-md-ol" : "nf-nia-md-ul";
    blocks.push(
      <Tag key={`l-${bi++}`} className={cls}>
        {listBuf.items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li${bi}-${idx}`)}</li>
        ))}
      </Tag>
    );
    listBuf = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      flushP();
      continue;
    }
    const ol = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    const ul = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ol) {
      flushP();
      if (!listBuf || !listBuf.ordered) {
        flushList();
        listBuf = { ordered: true, items: [] };
      }
      listBuf.items.push(ol[2]);
      continue;
    }
    if (ul) {
      flushP();
      if (!listBuf || listBuf.ordered) {
        flushList();
        listBuf = { ordered: false, items: [] };
      }
      listBuf.items.push(ul[1]);
      continue;
    }
    flushList();
    pBuf.push(trimmed);
  }
  flushList();
  flushP();

  // Fallback: se nada parseou, texto escapado simples
  if (!blocks.length) {
    return (
      <p className={cn("nf-nia-bubble-text", className)}>{escapeHtml(raw)}</p>
    );
  }

  return <div className={cn("nf-nia-md", className)}>{blocks}</div>;
}
