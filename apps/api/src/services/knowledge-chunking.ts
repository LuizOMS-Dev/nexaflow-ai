/**
 * Chunking de conhecimento: preserva títulos, parágrafos, listas e Q&A.
 * Tamanho em tokens aproximados (chars/4) — coerente com modelos 128k.
 */

export type KnowledgeChunkDraft = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: {
    heading?: string;
    kind: "heading" | "paragraph" | "list" | "qa" | "mixed";
  };
};

const TARGET_TOKENS = 420;
const MAX_TOKENS = 720;
const OVERLAP_TOKENS = 40;

export function estimateTokens(text: string): number {
  const n = (text || "").trim().length;
  if (!n) return 0;
  return Math.max(1, Math.ceil(n / 4));
}

function kindOf(block: string): KnowledgeChunkDraft["metadata"]["kind"] {
  const t = block.trim();
  if (/^#{1,6}\s+\S/.test(t)) return "heading";
  if (/^\s*([-*•]|\d+[.)])\s+\S/m.test(t) && (t.match(/^\s*([-*•]|\d+[.)])\s+/gm) || []).length >= 2) {
    return "list";
  }
  if (/^\s*(p(ergunta)?|q)\s*[:.]\s+/im.test(t) && /r(esposta)?\s*[:.]/im.test(t)) return "qa";
  return "paragraph";
}

function splitSections(raw: string): Array<{ heading: string; body: string }> {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const headingRe = /^(#{1,6})\s+(.+)$/gm;
  const hits: Array<{ index: number; heading: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text))) {
    hits.push({ index: m.index, heading: m[2].trim() });
  }
  if (!hits.length) return [{ heading: "", body: text }];

  const sections: Array<{ heading: string; body: string }> = [];
  if (hits[0].index > 0) {
    const lead = text.slice(0, hits[0].index).trim();
    if (lead) sections.push({ heading: "", body: lead });
  }
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const slice = text.slice(start, end).trim();
    if (slice) sections.push({ heading: hits[i].heading, body: slice });
  }
  return sections;
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function pack(blocks: string[], heading: string): string[] {
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  };
  for (const block of blocks) {
    const next = buf ? `${buf}\n\n${block}` : block;
    if (estimateTokens(next) > MAX_TOKENS && buf) {
      const overlap = overlapTail(buf);
      flush();
      buf = overlap ? `${overlap}\n\n${block}` : block;
      continue;
    }
    buf = next;
    if (estimateTokens(buf) >= TARGET_TOKENS) {
      const overlap = overlapTail(buf);
      flush();
      buf = overlap;
    }
  }
  flush();
  if (heading) {
    return out.map((c) => (c.startsWith("#") ? c : `## ${heading}\n\n${c}`));
  }
  return out;
}

function overlapTail(text: string): string {
  const tokens = estimateTokens(text);
  if (tokens <= OVERLAP_TOKENS) return "";
  const chars = OVERLAP_TOKENS * 4;
  const slice = text.slice(-chars).trim();
  const cut = slice.indexOf(" ");
  return cut > 0 ? slice.slice(cut + 1) : slice;
}

export function chunkKnowledgeContent(content: string): KnowledgeChunkDraft[] {
  const sections = splitSections(content);
  const packed: string[] = [];
  for (const s of sections) {
    const paras = splitParagraphs(s.body);
    packed.push(...pack(paras.length ? paras : [s.body], s.heading));
  }
  return packed.slice(0, 200).map((c, i) => ({
    chunkIndex: i,
    content: c.slice(0, 8000),
    tokenCount: estimateTokens(c),
    metadata: {
      heading: /^#{1,6}\s+(.+)$/m.exec(c)?.[1]?.trim(),
      kind: kindOf(c),
    },
  }));
}
