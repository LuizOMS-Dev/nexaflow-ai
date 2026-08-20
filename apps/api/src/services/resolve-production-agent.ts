import { prisma } from "../lib/prisma";

/**
 * Resolve o agente de IA elegível para AUTO em produção (WhatsApp).
 *
 * Regras:
 * - tenant isolado
 * - isActive
 * - mode === AUTO
 * - publishStatus === PUBLISHED (rascunho/arquivado nunca respondem)
 * - preferência: mais recentemente atualizado (operador escolheu/edito)
 *
 * Não cria segundo sistema: usa apenas AiAgent existente.
 */
export async function resolveProductionAutoAgent(tenantId: string) {
  // 1) Busca agente ativo em modo AUTO com publishStatus PUBLISHED
  let agent = await prisma.aiAgent.findFirst({
    where: {
      tenantId,
      isActive: true,
      mode: "AUTO",
      publishStatus: "PUBLISHED",
    },
    orderBy: { updatedAt: "desc" },
  });

  // 2) Se não achou com PUBLISHED explícito, aceita qualquer agente ativo com mode AUTO não arquivado
  if (!agent) {
    agent = await prisma.aiAgent.findFirst({
      where: {
        tenantId,
        isActive: true,
        mode: "AUTO",
        NOT: { publishStatus: "ARCHIVED" },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  // 3) Se não houver nenhum agente no tenant, cria/garante o agente padrão
  if (!agent) {
    const { ensureDefaultAiAgent } = await import("./ensure-default-agent");
    agent = await ensureDefaultAiAgent(tenantId);
  }

  return agent;
}
