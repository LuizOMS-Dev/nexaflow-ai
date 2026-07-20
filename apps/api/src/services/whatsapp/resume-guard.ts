/**
 * Regras de reabertura da IA após handoff humano.
 * Plataforma — aplica a TODOS os agentes / tenants.
 *
 * Mensagens de cortesia, ack ou encerramento NÃO contam como
 * “cliente voltou a pedir ajuda” e não reassumem o AUTO.
 */

/** Normaliza texto do cliente para comparação estável. */
export function normalizeCustomerText(raw: string): string {
  return (raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * true = só cortesia/ack → NÃO reabrir fila / NÃO reassumir IA.
 * false = parece pedido real ou pergunta → pode reassumir se config permitir.
 */
export function isTrivialCustomerAckMessage(raw: string): boolean {
  const original = (raw || "").trim();
  if (!original) return true;

  // Só emoji / pontuação
  if (/^[\s\p{P}\p{S}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u.test(original)) {
    return true;
  }

  const t = normalizeCustomerText(original);
  if (!t) return true;

  // Pedidos longos quase nunca são só “ok”
  if (t.length > 56) return false;

  const exact = new Set([
    "ok",
    "okay",
    "okk",
    "oks",
    "oki",
    "okey",
    "blz",
    "beleza",
    "valeu",
    "vlw",
    "vlww",
    "obg",
    "obgd",
    "obrigado",
    "obrigada",
    "obrigado pela ajuda",
    "obrigada pela ajuda",
    "muito obrigado",
    "muito obrigada",
    "muito obrigado pela ajuda",
    "muito obrigada pela ajuda",
    "thanks",
    "thank you",
    "thx",
    "ty",
    "tks",
    "tudo bem",
    "td bem",
    "tudo bom",
    "td bom",
    "tudo certo",
    "td certo",
    "tudo joia",
    "show",
    "top",
    "perfeito",
    "otimo",
    "otima",
    "excelente",
    "legal",
    "certo",
    "combinado",
    "fechado",
    "fechou",
    "tranquilo",
    "de boa",
    "deboas",
    "suave",
    "ta bom",
    "ta bem",
    "ta certo",
    "ta otimo",
    "pode ser",
    "entendi",
    "entendido",
    "beleza entendi",
    "ok obrigado",
    "ok obrigada",
    "ok valeu",
    "blz valeu",
    "blz obrigado",
    "blz obrigada",
    "valeu obrigado",
    "valeu obrigada",
    "tmj",
    "falou",
    "flw",
    "falows",
    "ate mais",
    "ate logo",
    "ate breve",
    "tchau",
    "tchau tchau",
    "bye",
    "byee",
    "boa noite",
    "bom dia",
    "boa tarde",
    "ss",
    "s",
    "sim",
    "nao",
    "n",
    "uhum",
    "aha",
    "aham",
    "hmm",
    "hm",
    "kk",
    "kkk",
    "kkkk",
    "haha",
    "hahaha",
    "rs",
    "rss",
    "rsrs",
    "joia",
    "maravilha",
    "perfeitto",
    "show de bola",
    "so isso",
    "so isso mesmo",
    "isso",
    "isso mesmo",
    "pode deixar",
    "sem problema",
    "sem problemas",
    "de nada",
    "disponha",
    "quando puder",
    "fico no aguardo",
    "aguardo",
    "ok combinado",
    "beleza combinado",
  ]);

  if (exact.has(t)) return true;

  // Padrões curtos de cortesia
  if (
    /^(ok|okay|blz|beleza|valeu|vlw|obg|obrigad[oa]|thanks?|thx|ty)(\s+(ok|valeu|obrigad[oa]|blz|mesmo|pela ajuda|por tudo)){0,2}$/.test(
      t
    )
  ) {
    return true;
  }
  if (/^(tudo|td)\s*(bem|bom|certo|joia)$/.test(t)) return true;
  if (/^(muito\s+)?obrigad[oa](\s+(pela?\s+)?(ajuda|atencao|atendimento))?$/.test(t)) {
    return true;
  }
  if (/^(ta|esta)\s*(bom|bem|certo|otimo|otima|joia)$/.test(t)) return true;
  if (/^(pode\s+deixar|deixe\s+comigo|sem\s+problemas?|de\s+nada)$/.test(t)) return true;
  if (/^(so|apenas)\s+(isso|isso\s+mesmo)$/.test(t)) return true;
  if (/^(perfeito|otimo|show|top|legal|combinado|fechado|fechou)[! ]*$/.test(t)) return true;
  if (/^(boa\s+(noite|tarde)|bom\s+dia)(\s+obrigad[oa])?$/.test(t)) return true;
  if (/^(ate\s+(mais|logo|breve)|tchau|bye|flw|falou)$/.test(t)) return true;
  // risadas / fillers
  if (/^(k{2,}|h(a|e){2,}|rs{1,4}|hum{1,3}|ah{1,3}m?)$/.test(t)) return true;

  return false;
}

/**
 * Cliente “voltou a pedir ajuda” de verdade (não é só ack).
 */
export function isMeaningfulCustomerReturnMessage(raw: string): boolean {
  return !isTrivialCustomerAckMessage(raw);
}
