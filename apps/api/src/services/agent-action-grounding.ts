/**
 * Agent Action Grounding — EXECUTE FIRST, THEN CLAIM.
 *
 * Impede promessas operacionais sem evidência (tool, knowledge retrieval real,
 * handoff confirmado ou job assíncrono rastreável).
 *
 * Aplicado a TODOS os agentes / modos / tenants (pós-geração + política de prompt).
 */

export type ToolRequiredIntent =
  | "CHECK_PRICE"
  | "CHECK_PLAN"
  | "CHECK_ORDER"
  | "CHECK_AVAILABILITY"
  | "CHECK_SCHEDULE"
  | "CHECK_STATUS"
  | "CHECK_PAYMENT"
  | "CHECK_APPOINTMENT"
  | "REQUEST_HUMAN"
  | null;

export type AgentOutcome =
  | "ANSWERED"
  | "INFORMATION_UNAVAILABLE"
  | "HANDOFF_OFFERED"
  | "HANDOFF_REQUESTED"
  | "WAITING_HUMAN"
  | "ACTION_CONFIRMED"
  | "TOOL_FAILED";

export type VerificationEvidence = {
  /** Knowledge retrieval foi executado nesta rodada */
  knowledgeQueried: boolean;
  /** Quantidade de docs retornados */
  knowledgeHitCount: number;
  /** Há trechos factuais relevantes ao intent (ex.: preço com R$) */
  knowledgeHadRelevantFacts: boolean;
  /** Trechos curtos de knowledge para fallback grounded (opcional) */
  knowledgeSnippets?: string[];
  /** Tools realmente executadas nesta rodada */
  toolsExecuted?: Array<{ name: string; ok: boolean }>;
  /** Handoff/request_human confirmado com sucesso */
  handoffConfirmed?: boolean;
  /** Job assíncrono real agendado (raro) */
  asyncJobScheduled?: boolean;
};

/** Frases de promessa futura sem mecanismo (FAKE_PENDING). */
const FUTURE_PROMISE_RE =
  /\b(vou|iremos|vamos|j[aá]\s+vou|deixa\s+eu|deixe\s+eu|posso\s+ir)\s+(verificar|consultar|confirmar|conferir|checar|buscar|olhar|pesquisar|averiguar|descobrir|falar\s+com\s+(a\s+)?equipe|confirmar\s+com\s+(a\s+)?equipe)|(\bj[aá]\s+volto\b|\bte\s+aviso\s+depois\b|\bassim\s+que\s+(eu\s+)?confirm|\bdepois\s+eu\s+(volto|te\s+passo|confirmo)|\baguarde\s+(um\s+momento|que\s+vou)|\bvolto\s+(com|j[aá])\b|\bem\s+breve\s+(te\s+)?(passo|confirmo))/i;

/** Claims no passado que exigem evidência. */
const PAST_VERIFY_RE =
  /\b(verifiquei|consultei|confirmei|conferi|chequei|busquei\s+nos?\s+(sistemas?|dados)|olhei\s+(no|na)\s+(base|sistema))\b/i;

const PAST_HANDOFF_RE =
  /\b(encaminhei|transferi|passei\s+(seu\s+)?(atendimento|caso)|acionei\s+(a\s+)?equipe|chamei\s+(um\s+)?(atendente|humano)|abri\s+(um\s+)?(chamado|ticket))\b/i;

const PAST_ACTION_RE =
  /\b(agendei|enviei|cancelei|registrei|atualizei\s+(o\s+)?(pedido|status)|marquei)\b/i;

/** Fluff comercial genérico que não responde preço/fato. */
const GENERIC_COMMERCIAL_FLUFF_RE =
  /pol[ií]tica\s+de\s+pre[cç]os?\s+[eé]\s+transparente|valores?\s+variam\s+de\s+acordo|competitiv[oa]|melhor\s+custo[- ]benef[ií]cio|or[cç]amento\s+personalizado\s+sem\s+n[uú]mero/i;

export function detectToolRequiredIntent(message: string): ToolRequiredIntent {
  const q = (message || "").toLowerCase();
  if (!q.trim()) return null;
  if (
    /humano|atendente|pessoa\s+real|falar\s+com\s+(algu[eé]m|a\s+equipe)|transferir|me\s+passa\s+para/i.test(
      q
    )
  ) {
    return "REQUEST_HUMAN";
  }
  if (
    /quanto\s+custa|qual\s+(o\s+)?pre[cç]o|pre[cç]os?|valor(es)?|or[cç]amento|tabela\s+de\s+pre[cç]|custa\s+quanto|me\s+passa\s+o\s+pre[cç]o/i.test(
      q
    )
  ) {
    return "CHECK_PRICE";
  }
  if (
    /plano|mensalidade|assinatura|pacote\s+de\s+servi[cç]/i.test(q) &&
    /pre[cç]o|custa|valor|qual(?:is)?|quais|tem|oferece|dispon[ií]ve|op[cç][oõ]es|lista|mostrar|conhecer/i.test(
      q
    )
  ) {
    return "CHECK_PLAN";
  }
  if (/pedido|encomenda|rastreio|tracking|n[uú]mero\s+do\s+pedido/i.test(q)) return "CHECK_ORDER";
  if (/dispon[ií]vel|tem\s+em\s+estoque|estoque|ainda\s+tem/i.test(q)) return "CHECK_AVAILABILITY";
  if (/hor[aá]rio|agenda|agendar|marcar\s+(um\s+)?hor[aá]rio|disponibilidade\s+de\s+agenda/i.test(q)) {
    return "CHECK_SCHEDULE";
  }
  if (/status\s+(do|da)|andamento|j[aá]\s+foi\s+(pago|enviado|aprovado)/i.test(q)) return "CHECK_STATUS";
  if (/pagamento|paguei|boleto|pix|fatura/i.test(q) && /confirm|status|caiu|recebeu/i.test(q)) {
    return "CHECK_PAYMENT";
  }
  if (/consulta|retorno|sess[aã]o\s+marcada|appointment/i.test(q)) return "CHECK_APPOINTMENT";
  return null;
}

export function containsFutureVerificationPromise(text: string): boolean {
  return FUTURE_PROMISE_RE.test(text || "");
}

export function containsPastVerificationClaim(text: string): boolean {
  return PAST_VERIFY_RE.test(text || "");
}

export function containsPastHandoffClaim(text: string): boolean {
  return PAST_HANDOFF_RE.test(text || "");
}

export function knowledgeLooksRelevantToIntent(
  intent: ToolRequiredIntent,
  docs: Array<{ title?: string; content?: string }>
): boolean {
  if (!docs.length) return false;
  const blob = docs.map((d) => `${d.title || ""}\n${d.content || ""}`).join("\n").toLowerCase();
  if (intent === "CHECK_PRICE" || intent === "CHECK_PLAN") {
    return (
      /r\$\s*\d|pre[cç]o|valor|a\s+partir\s+de|mensalidade|plano\s+\w+|custa/i.test(blob) ||
      /\d+[.,]\d{2}/.test(blob)
    );
  }
  if (intent === "CHECK_SCHEDULE") {
    return /hor[aá]rio|segunda|ter[cç]a|quarta|abertura|funcionamento|das?\s+\d/i.test(blob);
  }
  if (intent === "CHECK_AVAILABILITY") {
    return /estoque|dispon[ií]vel|sob\s+encomenda|prazo/i.test(blob);
  }
  // genérico: qualquer doc conta como "consultado"
  return blob.trim().length > 40;
}

function hasSuccessfulTool(
  evidence: VerificationEvidence,
  names?: string[]
): boolean {
  const list = evidence.toolsExecuted || [];
  return list.some((t) => t.ok && (!names || names.includes(t.name)));
}

function hasAnySuccessfulTool(evidence: VerificationEvidence): boolean {
  return (evidence.toolsExecuted || []).some((t) => t.ok);
}

/**
 * Remove frases de promessa futura / claims sem evidência (defesa em profundidade).
 */
export function stripUngroundedOperationalClaims(
  text: string,
  evidence: VerificationEvidence
): string {
  let out = text || "";

  // Frases/sentenças com promessa futura
  out = out
    .split(/(?<=[.!?…])\s+|\n+/)
    .filter((sentence) => {
      const s = sentence.trim();
      if (!s) return false;
      if (FUTURE_PROMISE_RE.test(s) && !evidence.asyncJobScheduled && !hasAnySuccessfulTool(evidence)) {
        return false;
      }
      if (PAST_VERIFY_RE.test(s) && !evidence.knowledgeQueried && !hasAnySuccessfulTool(evidence)) {
        return false;
      }
      if (PAST_HANDOFF_RE.test(s) && !evidence.handoffConfirmed) {
        return false;
      }
      if (
        PAST_ACTION_RE.test(s) &&
        !hasAnySuccessfulTool(evidence) &&
        !evidence.asyncJobScheduled &&
        !evidence.handoffConfirmed
      ) {
        return false;
      }
      return true;
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Residual inline
  if (!evidence.asyncJobScheduled && !hasAnySuccessfulTool(evidence)) {
    out = out.replace(FUTURE_PROMISE_RE, "").replace(/\s{2,}/g, " ").trim();
  }
  if (!evidence.handoffConfirmed) {
    out = out.replace(PAST_HANDOFF_RE, "").replace(/\s{2,}/g, " ").trim();
  }

  return out.replace(/\s+([.,;:!?])/g, "$1").trim();
}

export function buildUnavailableFactReply(params: {
  intent: ToolRequiredIntent;
  offerHandoff?: boolean;
}): string {
  const offer = params.offerHandoff !== false;
  if (params.intent === "CHECK_PLAN") {
    return offer
      ? "Não encontrei uma lista confirmada de planos nas informações disponíveis para mim. Posso encaminhar seu atendimento para a equipe responsável, se preferir."
      : "Não encontrei uma lista confirmada de planos nas informações disponíveis para mim.";
  }
  if (params.intent === "CHECK_PRICE") {
    return offer
      ? "Não encontrei um valor confirmado para esse serviço nas informações disponíveis para mim. Posso encaminhar seu atendimento para a equipe responsável pelo orçamento, se preferir."
      : "Não encontrei um valor confirmado para esse serviço nas informações disponíveis para mim.";
  }
  if (params.intent === "CHECK_SCHEDULE") {
    return offer
      ? "Não encontrei horários confirmados nas informações disponíveis. Posso encaminhar você para a equipe confirmar a agenda."
      : "Não encontrei horários confirmados nas informações disponíveis.";
  }
  return offer
    ? "Não encontrei essa informação confirmada nas fontes disponíveis para mim. Posso encaminhar seu atendimento para a equipe responsável, se preferir."
    : "Não encontrei essa informação confirmada nas fontes disponíveis para mim.";
}

function normalizeFactText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Detecta nomes de planos ou valores citados pelo modelo que não aparecem nas fontes recuperadas. */
export function hasUnsupportedCommercialFacts(
  reply: string,
  evidence: VerificationEvidence
): boolean {
  const source = normalizeFactText((evidence.knowledgeSnippets || []).join("\n"));
  const answer = normalizeFactText(reply);
  if (!answer) return false;

  const genericPlanWords = new Set([
    "ideal",
    "certo",
    "adequado",
    "disponivel",
    "melhor",
    "especifico",
    "personalizado",
  ]);
  const planNames = Array.from(answer.matchAll(/\bplano\s+([a-z0-9][a-z0-9-]{2,30})\b/g))
    .map((match) => match[1])
    .filter((name) => !genericPlanWords.has(name));
  if (planNames.some((name) => !source.includes(`plano ${name}`))) return true;

  const prices = Array.from(answer.matchAll(/r\$\s*\d+(?:[.,]\d{1,2})?/g)).map((match) =>
    match[0].replace(/\s+/g, "")
  );
  const compactSource = source.replace(/\s+/g, "");
  return prices.some((price) => !compactSource.includes(price));
}

export function buildKnowledgeGroundedPriceHint(snippets: string[]): string | null {
  const text = snippets.join("\n").trim();
  if (!text) return null;
  // Pega uma linha com preço se existir
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const priceLine = lines.find((l) => /r\$\s*\d|a\s+partir\s+de\s+r\$|\d+[.,]\d{2}/i.test(l));
  const body = (priceLine || lines[0] || "").slice(0, 280);
  if (!body) return null;
  return `Nas informações disponíveis: ${body}${body.length >= 280 ? "…" : ""} Se quiser, me diga mais detalhes do que você precisa para eu orientar melhor.`;
}

export type GroundAgentOutboundResult = {
  reply: string;
  needsHumanHandoff: boolean;
  outcome: AgentOutcome;
  rewritten: boolean;
  blockedFakePending: boolean;
  intent: ToolRequiredIntent;
};

/**
 * Grounding central da saída do agente.
 * - Remove FAKE_PENDING ("vou verificar" sem ação)
 * - Remove claims passados sem evidência
 * - Substitui por transparência + oferta de handoff quando aplicável
 */
export function groundAgentOutbound(params: {
  reply: string;
  userMessage: string;
  evidence: VerificationEvidence;
  /** Oferecer handoff em INFORMATION_UNAVAILABLE */
  offerHandoff?: boolean;
  /** Só true se handoff será de fato criado nesta rodada */
  willExecuteHandoff?: boolean;
}): GroundAgentOutboundResult {
  const intent = detectToolRequiredIntent(params.userMessage);
  const evidence = params.evidence;
  let reply = (params.reply || "").trim();
  let rewritten = false;
  let blockedFakePending = false;
  let needsHumanHandoff = Boolean(params.willExecuteHandoff && evidence.handoffConfirmed);
  let outcome: AgentOutcome = "ANSWERED";

  const hadFuturePromise = containsFutureVerificationPromise(reply);
  const hadFalseHandoff = containsPastHandoffClaim(reply) && !evidence.handoffConfirmed;
  const hadFalseVerify =
    containsPastVerificationClaim(reply) &&
    !evidence.knowledgeQueried &&
    !hasAnySuccessfulTool(evidence);

  if (hadFuturePromise || hadFalseHandoff || hadFalseVerify) {
    blockedFakePending = hadFuturePromise;
    const stripped = stripUngroundedOperationalClaims(reply, evidence);
    reply = stripped;
    rewritten = true;
  }

  // Handoff falso: se strip esvaziou a frase, oferece encaminhar (sem afirmar que já fez)
  if (hadFalseHandoff && (!reply || reply.length < 8)) {
    reply =
      "Posso encaminhar seu atendimento para a equipe responsável, se você quiser.";
    rewritten = true;
    outcome = "HANDOFF_OFFERED";
  }

  // Fluff genérico em pergunta de preço
  if (
    (intent === "CHECK_PRICE" || intent === "CHECK_PLAN") &&
    GENERIC_COMMERCIAL_FLUFF_RE.test(reply) &&
    !/r\$\s*\d|a\s+partir\s+de/i.test(reply)
  ) {
    reply = "";
    rewritten = true;
  }

  const emptyOrWeak =
    !reply ||
    reply.length < 12 ||
    /^(claro|certo|ok|entendi|pode\s+deixar)[.!]?$/i.test(reply);

  const commercialIntent = intent === "CHECK_PRICE" || intent === "CHECK_PLAN";
  const unsupportedCommercialFacts =
    commercialIntent && hasUnsupportedCommercialFacts(reply, evidence);

  if (
    commercialIntent &&
    evidence.knowledgeQueried &&
    !hasAnySuccessfulTool(evidence) &&
    (!evidence.knowledgeHadRelevantFacts || unsupportedCommercialFacts)
  ) {
    reply = buildUnavailableFactReply({
      intent,
      offerHandoff: params.offerHandoff !== false,
    });
    rewritten = true;
    outcome =
      params.offerHandoff !== false ? "HANDOFF_OFFERED" : "INFORMATION_UNAVAILABLE";
  }

  // Preço/fato: knowledge com fatos → se a resposta ficou fraca, usa snippet
  if (
    (intent === "CHECK_PRICE" || intent === "CHECK_PLAN") &&
    evidence.knowledgeQueried &&
    evidence.knowledgeHadRelevantFacts &&
    (emptyOrWeak || blockedFakePending)
  ) {
    const hint = buildKnowledgeGroundedPriceHint(evidence.knowledgeSnippets || []);
    if (hint) {
      reply = hint;
      rewritten = true;
      outcome = "ANSWERED";
    }
  }

  // Preço/fato: knowledge consultado, sem fato → transparência (não "vou verificar")
  if (
    intent &&
    intent !== "REQUEST_HUMAN" &&
    evidence.knowledgeQueried &&
    !evidence.knowledgeHadRelevantFacts &&
    !hasAnySuccessfulTool(evidence) &&
    (emptyOrWeak || blockedFakePending || hadFuturePromise)
  ) {
    reply = buildUnavailableFactReply({
      intent,
      offerHandoff: params.offerHandoff !== false,
    });
    rewritten = true;
    outcome =
      params.offerHandoff !== false ? "HANDOFF_OFFERED" : "INFORMATION_UNAVAILABLE";
  }

  // Ainda sobrou promessa futura → força transparência
  if (containsFutureVerificationPromise(reply) && !evidence.asyncJobScheduled) {
    reply = buildUnavailableFactReply({
      intent: intent || "CHECK_PRICE",
      offerHandoff: params.offerHandoff !== false,
    });
    rewritten = true;
    blockedFakePending = true;
    outcome =
      params.offerHandoff !== false ? "HANDOFF_OFFERED" : "INFORMATION_UNAVAILABLE";
  }

  // Handoff claim só se confirmado
  if (containsPastHandoffClaim(reply) && !evidence.handoffConfirmed) {
    reply = reply.replace(PAST_HANDOFF_RE, "posso encaminhar");
    if (!/equipe|atendente|humano/i.test(reply)) {
      reply =
        "Posso encaminhar seu atendimento para a equipe responsável, se você quiser.";
    }
    rewritten = true;
    outcome = "HANDOFF_OFFERED";
  }

  if (evidence.handoffConfirmed) {
    outcome = "HANDOFF_REQUESTED";
    needsHumanHandoff = true;
  }

  // Tool falhou e resposta vazia
  if (
    (evidence.toolsExecuted || []).some((t) => !t.ok) &&
    !hasAnySuccessfulTool(evidence) &&
    emptyOrWeak
  ) {
    reply =
      "Não consegui consultar essa informação agora. Posso encaminhar seu atendimento para a equipe responsável, se preferir.";
    rewritten = true;
    outcome = "TOOL_FAILED";
  }

  return {
    reply: reply.trim(),
    needsHumanHandoff,
    outcome,
    rewritten,
    blockedFakePending,
    intent,
  };
}

/**
 * Bloco de política para system prompt (EXECUTE FIRST, THEN CLAIM).
 * Complementa a Truth Policy global.
 */
export function buildActionGroundingPolicy(): string {
  return `═══ AÇÃO E VERACIDADE OPERACIONAL (OBRIGATÓRIA) ═══
EXECUTE FIRST, THEN CLAIM. Nunca crie a ilusão de tarefa em segundo plano.

PROIBIDO dizer (sem tool/handoff/job real NESTA execução):
- "vou verificar / consultar / confirmar / conferir / buscar"
- "já volto", "te aviso depois", "assim que confirmar retorno"
- "vou falar com a equipe" / "vou confirmar com a equipe"
- "encaminhei" / "transferi" (só DEPOIS de handoff confirmado)
- "verifiquei / consultei / confirmei" sem consulta real nesta rodada

QUANDO O KNOWLEDGE TIVER O FATO:
- Responda AGORA com o fato (ex.: preço "a partir de R$ X").
- Não diga que vai verificar o que já está nas fontes.

QUANDO O KNOWLEDGE NÃO TIVER O FATO:
- NÃO invente. NÃO diga "vou verificar depois".
- Diga com transparência: "Não encontrei [fato] confirmado nas informações disponíveis."
- Ofereça encaminhar para a equipe (handoff) se fizer sentido — sem fingir que já encaminhou.

TOOLS: se precisar de dado dinâmico e houver tool autorizada, a plataforma executa a tool antes da resposta final. Você responde COM o resultado. Sem tool: não afirme que consultou.

HANDOFF: só diga "encaminhei" se a ação de handoff foi confirmada. Caso contrário: "Posso encaminhar…".

PREÇOS: use só Knowledge/tools oficiais. "A partir de" permanece "a partir de". Rascunho/não autorizado = não use.

RESPOSTA GENÉRICA PROIBIDA para "quanto custa?":
- Não use "política transparente e competitiva" no lugar de um valor ou de uma recusa honesta.
═══ FIM AÇÃO E VERACIDADE OPERACIONAL ═══`;
}
