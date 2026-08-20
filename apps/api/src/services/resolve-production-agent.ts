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
  return prisma.aiAgent.findFirst({
    where: {
      tenantId,
      isActive: true,
      mode: "AUTO",
      publishStatus: "PUBLISHED",
    },
    orderBy: { updatedAt: "desc" },
  });
}
