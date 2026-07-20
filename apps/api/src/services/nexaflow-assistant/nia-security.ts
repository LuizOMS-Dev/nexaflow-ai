/**
 * Blindagem da NIA — detecção de abuso e sanitização de saída.
 * Camada de backend; não substitui o system prompt.
 */

export type NiaSecurityHit =
  | "prompt_injection"
  | "secret_extraction"
  | "system_prompt_extraction"
  | "privilege_escalation"
  | "cross_tenant"
  | "chain_of_thought"
  | "tool_abuse"
  | "reverse_engineering"
  | "data_exfiltration"
  | "session_spoofing";

const PATTERNS: Array<{ kind: NiaSecurityHit; re: RegExp }> = [
  {
    kind: "prompt_injection",
    re: /ignore\s+(todas?\s+)?(as\s+)?(regras|instruções|instruções\s+anteriores|system\s*prompt)|esqueça\s+(suas\s+)?(regras|instruções)|você\s+agora\s+é|you\s+are\s+now|jailbreak|DAN\s+mode|desative\s+(a\s+)?(veracidade|política)|developer\s*mode|god\s*mode|bypass\s+(safety|guard|filter)/i,
  },
  {
    kind: "secret_extraction",
    re: /(mostre|revele|envie|liste|print|dump|exponha).{0,40}(api[_\s-]?key|openai|groq|jwt|refresh\s*token|webhook\s*secret|totp|recovery\s*code|senha|password|authorization|env(\.|ironment)|DATABASE_URL|REDIS|cookie|twoFactor|backup\s*code)/i,
  },
  {
    kind: "system_prompt_extraction",
    re: /(mostre|revele|imprima|repita|exporte).{0,40}(system\s*prompt|instruções\s+internas|prompt\s+interno|guardrails|hidden\s*prompt|política\s+completa|truth\s*policy|ACCOUNT_DIAGNOSTIC)/i,
  },
  {
    kind: "privilege_escalation",
    re: /(finja|aja|atue|simule).{0,20}(superadmin|super\s*admin|administrador\s+global)|ignore\s+(meu\s+)?(rbac|plano|permiss|entitlement|access\s*gate)|me\s+torne\s+(admin|superadmin)|eleve\s+(minhas?\s+)?permiss/i,
  },
  {
    // Antes de cross_tenant: spoof explícito de identidade na mensagem
    kind: "session_spoofing",
    re: /(use|assuma|considere)\s+(tenantId|userId|user_id|tenant_id)\s*[=:]\s*\S+|(meu\s+)?(userId|tenantId)\s+(é|agora\s+[eé])\s+\S+|(finja|aja)\s+como\s+se\s+(eu\s+fosse|fosse)\s+(o\s+)?usu[aá]rio\s+\S+/i,
  },
  {
    kind: "cross_tenant",
    re: /(outra\s+empresa|tenant\s+b|empresa\s+b|todas\s+as\s+empresas|clientes\s+de\s+outra|dados\s+globais\s+da\s+plataforma|troque\s+(para\s+)?(o\s+)?tenant|mude\s+(de\s+)?empresa\s+para)/i,
  },
  {
    kind: "chain_of_thought",
    re: /(mostre|revele).{0,20}(raciocínio\s+interno|chain[- ]of[- ]thought|passo\s+a\s+passo\s+interno|thinking\s+process)/i,
  },
  {
    kind: "tool_abuse",
    re: /(execute|rode|dispare|chame\s+a\s+tool).{0,40}(sql|shell|bash|exclusão|delete\s+from|rm\s+-rf|drop\s+table|prisma\.|raw\s*query)|deletar\s+(a\s+)?empresa|bloquear\s+(todos?\s+)?usuários|enviar\s+campanha|reconecte\s+via\s+api\s+interna/i,
  },
  {
    kind: "reverse_engineering",
    re: /(engenhar(ia)?\s+reversa|reverse\s*engineer|como\s+(você|vc)\s+(funciona\s+por\s+dentro|consulta\s+o\s+banco)|liste\s+(todas?\s+)?(as\s+)?(tools?|ferramentas|probes?|sondas)\s+(internas?|do\s+sistema)|schema\s+(completo\s+)?(do\s+)?diagn[oó]stico|fonte\s+do\s+allowlist|endpoint\s+interno\s+da\s+nia|descompile|disassembl)/i,
  },
  {
    kind: "data_exfiltration",
    re: /(dump|exporte|exfiltrate|exfiltre).{0,40}(conta|account|json|diagn[oó]stico|todos\s+os\s+campos|raw\s*data|payload\s+completo)|(mostre|liste)\s+(todo|todos|todas)\s+(o\s+)?(s\s+)?(dados\s+(brutos?|da\s+conta|internos?)|campos\s+do\s+diagn)|cole\s+o\s+json\s+completo\s+da\s+sess[aã]o/i,
  },
];

export function detectNiaSecurityThreat(message: string): NiaSecurityHit | null {
  const text = (message || "").trim();
  if (!text) return null;
  for (const p of PATTERNS) {
    if (p.re.test(text)) return p.kind;
  }
  return null;
}

export function niaSecurityRefusal(kind: NiaSecurityHit): string {
  switch (kind) {
    case "secret_extraction":
      return "Não posso revelar chaves, tokens, senhas ou outros segredos da plataforma. Posso ajudar com o uso seguro da NexaFlow.";
    case "system_prompt_extraction":
      return "Não compartilho instruções internas do sistema. Posso ajudar com dúvidas sobre como usar a NexaFlow.";
    case "privilege_escalation":
      return "Não posso alterar ou simular permissões. Continuo respeitando o seu papel e o plano da sua empresa.";
    case "cross_tenant":
      return "Só posso falar sobre a empresa da sua sessão atual. Não acesso dados de outras empresas.";
    case "chain_of_thought":
      return "Posso resumir a conclusão com clareza, mas não exponho raciocínio interno detalhado do sistema.";
    case "tool_abuse":
      return "Não executo ações destrutivas ou administrativas por aqui. Posso orientar como fazer na interface, se você tiver permissão.";
    case "reverse_engineering":
      return "Não exponho arquitetura interna, ferramentas ou esquemas de diagnóstico. Posso consultar o estado da sua conta e orientar a solução em linguagem clara.";
    case "data_exfiltration":
      return "Não faço dump de dados brutos da conta. Posso resumir o que importa para o seu problema (WhatsApp, agentes, plano, etc.) de forma segura.";
    case "session_spoofing":
      return "Não aceito troca de identidade ou empresa pela mensagem. Uso somente a sessão autenticada no painel.";
    case "prompt_injection":
    default:
      return "Não posso ignorar as regras de segurança da NexaFlow. Como posso ajudar com o uso da plataforma?";
  }
}

/**
 * Redige IDs internos / dumps que o modelo possa ecoar.
 * Defense-in-depth na saída.
 */
export function redactDiagnosticLeakFromOutput(text: string): string {
  let out = text || "";
  // CUIDs / IDs longos estilo Prisma
  out = out.replace(/\b(c[a-z0-9]{20,})\b/gi, "[id]");
  out = out.replace(/USER_ID\s*:\s*\S+/gi, "USER_ID: [session]");
  out = out.replace(/TENANT_ID\s*:\s*\S+/gi, "TENANT_ID: [session]");
  out = out.replace(/ACCOUNT_DIAGNOSTIC_SCHEMA[\s\S]{0,80}/gi, "[diagnóstico interno omitido]");
  return out;
}

/** Remove padrões óbvios de secret em saídas do modelo (defense in depth). */
export function redactSecretsFromOutput(text: string): string {
  let out = text || "";
  out = out.replace(
    /\b(sk-[a-zA-Z0-9]{10,}|gsk_[a-zA-Z0-9]{10,}|nxf_live_[A-Za-z0-9_-]{10,}|whsec_[A-Za-z0-9_-]{10,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,
    "[redacted]"
  );
  out = out.replace(
    /\b(GROQ|OPENAI|XAI|DATABASE|REDIS)_[A-Z0-9_]+\s*[=:]\s*\S+/gi,
    "[redacted]"
  );
  out = redactDiagnosticLeakFromOutput(out);
  return out;
}

export function sanitizeUserMessage(raw: string, max = 2000): string {
  return (raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}
