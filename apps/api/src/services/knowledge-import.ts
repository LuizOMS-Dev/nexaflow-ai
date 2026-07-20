/**
 * Importação inteligente em lote da Base de Conhecimento.
 * - Separa por títulos Markdown (# / ##) quando existirem
 * - Fallback heurístico / opcional IA
 * - Nunca inventa fatos; só organiza o texto do arquivo
 * - Detecta secrets e possíveis duplicidades
 */

import { randomUUID } from "crypto";

import { env } from "../lib/env";

export type ImportDraftItem = {
  /** id temporário (cliente/servidor) */
  tempId: string;
  title: string;
  category: string;
  content: string;
  /** sugestão: incluir na importação */
  selected: boolean;
  /** possível duplicata na base existente */
  duplicateOf: { id: string; title: string } | null;
  /** conflito interno no arquivo */
  conflictNote: string | null;
  /** bloqueado por conteúdo sensível */
  blocked: boolean;
  blockReason: string | null;
};

export type ImportAnalysis = {
  filename: string;
  mode: "structured" | "heuristic" | "ai";
  stage: "ready_for_review";
  items: ImportDraftItem[];
  warnings: string[];
  stats: {
    chars: number;
    sectionsFound: number;
    duplicates: number;
    blocked: number;
    conflicts: number;
  };
};

const MAX_CHARS = 120_000;
const MAX_ITEMS = 40;

const SENSITIVE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-z0-9_\-]{16,}/i, label: "API key" },
  { re: /(?:secret|token|password|senha)\s*[:=]\s*\S{8,}/i, label: "credencial" },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, label: "chave privada" },
  { re: /sk-[a-zA-Z0-9]{20,}/, label: "secret token" },
  { re: /gsk_[a-zA-Z0-9]{20,}/, label: "API key Groq" },
  { re: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/i, label: "Bearer token" },
  { re: /postgres(?:ql)?:\/\/[^\s]+/i, label: "connection string" },
  { re: /mongodb(?:\+srv)?:\/\/[^\s]+/i, label: "connection string" },
];

const CATEGORY_HINTS: Array<{ re: RegExp; category: string }> = [
  { re: /hor[aá]rio|funcionamento|atendimento.*hora/i, category: "Atendimento" },
  { re: /pagamento|pix|cart[aã]o|boleto|parcel/i, category: "Pagamentos" },
  { re: /entreg|frete|envio|prazo/i, category: "Entrega" },
  { re: /troc|devolu[cç]/i, category: "Políticas" },
  { re: /garanti/i, category: "Políticas" },
  { re: /pre[cç]o|valor|plano|mensalidade|r\$/i, category: "Comercial" },
  { re: /produto|servi[cç]o|cat[aá]logo/i, category: "Produtos" },
  { re: /faq|perguntas?\s+frequentes?/i, category: "FAQ" },
  { re: /localiza[cç][aã]o|endere[cç]o|onde\s+fica/i, category: "Geral" },
  { re: /suporte|problema|t[eé]cnic/i, category: "Suporte" },
  { re: /sobre\s+a\s+empresa|quem\s+somos/i, category: "Geral" },
];

function normalizeTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size);
}

function suggestCategory(title: string, content: string): string {
  const blob = `${title}\n${content}`;
  for (const h of CATEGORY_HINTS) {
    if (h.re.test(blob)) return h.category;
  }
  return "Geral";
}

function humanizeHeading(raw: string): string {
  const t = raw.replace(/^#+\s*/, "").trim();
  if (!t) return "Conhecimento";
  // Title Case simples em PT
  return t
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (["de", "da", "do", "das", "dos", "e", "em", "a", "o"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function detectSensitive(text: string): { hit: boolean; reason: string | null } {
  for (const p of SENSITIVE_PATTERNS) {
    if (p.re.test(text)) {
      return { hit: true, reason: `Possível ${p.label} detectado — não será importado.` };
    }
  }
  return { hit: false, reason: null };
}

/** Parse por headings Markdown (# ou ##) */
export function parseStructuredMarkdown(text: string): Array<{ title: string; content: string }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (!currentTitle) return;
    const content = buf.join("\n").trim();
    if (content.length >= 8) {
      sections.push({ title: humanizeHeading(currentTitle), content });
    }
    buf = [];
  };

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (m) {
      flush();
      currentTitle = m[2].trim();
      continue;
    }
    if (currentTitle === null) {
      // preâmbulo sem título — acumula em "Introdução" se houver conteúdo
      if (line.trim()) {
        if (!sections.length && !currentTitle) {
          currentTitle = "Informações gerais";
        }
        buf.push(line);
      }
      continue;
    }
    buf.push(line);
  }
  flush();
  return sections;
}

/** Fallback: blocos separados por linhas em branco + primeira linha como título */
export function parseHeuristicBlocks(text: string): Array<{ title: string; content: string }> {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 12);

  if (blocks.length <= 1) {
    const clean = text.trim();
    if (clean.length < 12) return [];
    const firstLine = clean.split("\n")[0].slice(0, 80);
    return [
      {
        title: firstLine.length > 8 && firstLine.length < 60 ? humanizeHeading(firstLine) : "Conhecimento importado",
        content: clean,
      },
    ];
  }

  return blocks.slice(0, MAX_ITEMS).map((block, i) => {
    const lines = block.split("\n").filter(Boolean);
    const first = lines[0].replace(/^[-*•]\s*/, "").trim();
    const looksLikeTitle =
      first.length <= 80 &&
      (lines.length > 1 || /^[A-ZÁÉÍÓÚÃÕÂÊÔÇ0-9]/.test(first)) &&
      !first.endsWith(".");
    if (looksLikeTitle && lines.length > 1) {
      return {
        title: humanizeHeading(first),
        content: lines.slice(1).join("\n").trim() || block,
      };
    }
    return {
      title: `Tópico ${i + 1}`,
      content: block,
    };
  });
}

/** Conflitos simples: horários ou valores contraditórios no mesmo item ou entre itens */
export function detectConflicts(
  items: Array<{ title: string; content: string }>
): Map<number, string> {
  const map = new Map<number, string>();
  const hourRe = /(\d{1,2})\s*h(?:\s*às\s*|\s*as\s*|\s*-\s*|\s*até\s*)(\d{1,2})\s*h/gi;
  const hours: Array<{ idx: number; a: number; b: number }> = [];

  items.forEach((it, idx) => {
    const local: Array<[number, number]> = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(hourRe.source, "gi");
    while ((m = re.exec(it.content)) !== null) {
      local.push([Number(m[1]), Number(m[2])]);
      hours.push({ idx, a: Number(m[1]), b: Number(m[2]) });
    }
    // conflito dentro do mesmo bloco
    if (local.length >= 2) {
      const unique = new Set(local.map(([a, b]) => `${a}-${b}`));
      if (unique.size > 1) {
        map.set(idx, "Possível conflito de horários neste trecho. Revise antes de importar.");
      }
    }
  });

  // conflito entre blocos de horário
  const hourItems = hours.reduce<Record<number, string[]>>((acc, h) => {
    (acc[h.idx] ||= []).push(`${h.a}-${h.b}`);
    return acc;
  }, {});
  const keys = Object.keys(hourItems).map(Number);
  if (keys.length >= 2) {
    const sets = keys.map((k) => new Set(hourItems[k]));
    const all = new Set(sets.flatMap((s) => [...s]));
    if (all.size > 1) {
      for (const k of keys) {
        if (!map.has(k)) {
          map.set(k, "Possível conflito de horários com outro trecho do arquivo.");
        }
      }
    }
  }
  return map;
}

export function findDuplicate(
  title: string,
  content: string,
  existing: Array<{ id: string; title: string; content: string }>
): { id: string; title: string } | null {
  let best: { id: string; title: string; score: number } | null = null;
  const nContent = content.slice(0, 400).toLowerCase();
  for (const ex of existing) {
    const ts = titleSimilarity(title, ex.title);
    const contentHit =
      nContent.length > 40 &&
      ex.content.toLowerCase().includes(nContent.slice(0, 80).trim())
        ? 0.3
        : 0;
    const score = Math.max(ts, contentHit > 0 ? ts + contentHit : ts);
    if (score >= 0.72 && (!best || score > best.score)) {
      best = { id: ex.id, title: ex.title, score };
    }
  }
  return best ? { id: best.id, title: best.title } : null;
}

export function chunkContent(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((c) => c.slice(0, 2000));
}

/**
 * Opcional: IA reorganiza seções já extraídas (não inventa fatos).
 * Via AI Core (platform managed / tenant BYOK no caller com tenantId se disponível).
 */
async function enhanceWithAi(
  sections: Array<{ title: string; content: string }>,
  tenantId?: string | null
): Promise<Array<{ title: string; content: string }> | null> {
  if (sections.length === 0) return null;
  if (!env.aiApiKey && !tenantId) return null;

  const payload = sections.map((s, i) => ({
    i,
    title: s.title,
    content: s.content.slice(0, 2500),
  }));

  try {
    const { generateForScope } = await import("./ai-core");
    const gen = await generateForScope({
      scope: tenantId ? "tenant" : "platform",
      tenantId: tenantId || null,
      temperature: 0.2,
      maxTokens: 2000,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content: `Você organiza base de conhecimento de empresas.
REGRAS:
- NÃO invente fatos, preços, horários ou políticas.
- Só reorganize e melhore títulos/categorias com base no texto dado.
- Retorne APENAS JSON: {"items":[{"i":0,"title":"...","category":"...","content":"..."}]}
- content deve ser o mesmo texto (pode limpar espaços), sem adicionar informação nova.
- category em português curto: Atendimento, Pagamentos, Entrega, Políticas, Comercial, Produtos, FAQ, Suporte, Geral.
- Máximo ${MAX_ITEMS} itens.`,
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
    });
    if (!gen?.content) return null;
    const raw = gen.content || "{}";
    const parsed = JSON.parse(raw) as {
      items?: Array<{ i?: number; title?: string; category?: string; content?: string }>;
    };
    if (!parsed.items?.length) return null;

    return parsed.items
      .slice(0, MAX_ITEMS)
      .map((it) => {
        const src = sections[it.i ?? 0] || sections[0];
        return {
          title: (it.title || src.title).trim().slice(0, 160),
          content: (it.content || src.content).trim(),
          category: (it.category || suggestCategory(it.title || src.title, it.content || src.content)).trim(),
        };
      })
      .filter((x) => x.content.length >= 8)
      .map(({ title, content }) => ({ title, content }));
  } catch {
    return null;
  }
}

export async function analyzeKnowledgeImport(params: {
  text: string;
  filename: string;
  existing: Array<{ id: string; title: string; content: string }>;
  useAi?: boolean;
}): Promise<ImportAnalysis> {
  const warnings: string[] = [];
  let text = (params.text || "").replace(/^\uFEFF/, "").trim();
  const filename = (params.filename || "arquivo.txt").slice(0, 200);

  if (!text) {
    throw Object.assign(new Error("Arquivo vazio ou sem texto legível."), { statusCode: 400 });
  }
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    warnings.push(`Arquivo truncado em ${MAX_CHARS} caracteres para análise.`);
  }

  const globalSensitive = detectSensitive(text);
  if (globalSensitive.hit) {
    warnings.push(
      "O arquivo parece conter credenciais ou secrets. Trechos sensíveis serão bloqueados."
    );
  }

  let mode: ImportAnalysis["mode"] = "heuristic";
  let sections = parseStructuredMarkdown(text);
  if (sections.length >= 2) {
    mode = "structured";
  } else {
    sections = parseHeuristicBlocks(text);
    mode = "heuristic";
  }

  if (params.useAi !== false && sections.length > 0) {
    const enhanced = await enhanceWithAi(sections);
    if (enhanced?.length) {
      sections = enhanced;
      if (mode !== "structured") mode = "ai";
      else warnings.push("Títulos e categorias refinados pela IA (sem inventar fatos).");
    }
  }

  if (!sections.length) {
    throw Object.assign(new Error("Não foi possível identificar conhecimentos neste arquivo."), {
      statusCode: 400,
    });
  }

  const conflicts = detectConflicts(sections);

  const items: ImportDraftItem[] = sections.slice(0, MAX_ITEMS).map((sec, idx) => {
    const sens = detectSensitive(sec.content);
    const dup = findDuplicate(sec.title, sec.content, params.existing);
    const category = suggestCategory(sec.title, sec.content);
    return {
      tempId: randomUUID(),
      title: sec.title.slice(0, 160),
      category,
      content: sec.content.slice(0, 20_000),
      selected: !sens.hit,
      duplicateOf: dup,
      conflictNote: conflicts.get(idx) || null,
      blocked: sens.hit,
      blockReason: sens.reason,
    };
  });

  return {
    filename,
    mode,
    stage: "ready_for_review",
    items,
    warnings,
    stats: {
      chars: text.length,
      sectionsFound: items.length,
      duplicates: items.filter((i) => i.duplicateOf).length,
      blocked: items.filter((i) => i.blocked).length,
      conflicts: items.filter((i) => i.conflictNote).length,
    },
  };
}

export const IMPORT_SAMPLE_MD = `# SOBRE A EMPRESA

Descreva aqui o que a empresa faz, para quem e o diferencial.

# HORÁRIO DE FUNCIONAMENTO

Funcionamos de segunda a sexta das 8h às 18h.
Aos sábados das 8h às 12h.

# PRODUTOS E SERVIÇOS

Liste produtos e serviços principais.

# PREÇOS

Informe preços ou faixas de valor quando fizer sentido.

# FORMAS DE PAGAMENTO

Aceitamos PIX, cartão de crédito e débito.
Parcelamos compras acima de R$ 200 em até 3 vezes.

# ENTREGA

Descreva regiões, prazos e condições de entrega.

# TROCAS E DEVOLUÇÕES

Produtos podem ser trocados em até 7 dias mediante apresentação da nota fiscal.

# GARANTIA

Informe a política de garantia.

# PERGUNTAS FREQUENTES

P: ...
R: ...

# REGRAS DE ATENDIMENTO

Regras importantes que o agente deve seguir ao falar com clientes.
`;
