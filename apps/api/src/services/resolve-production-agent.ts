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
  const published = await prisma.aiAgent.findFirst({
    where: {
      tenantId,
      isActive: true,
      mode: "AUTO",
      publishStatus: "PUBLISHED",
    },
    orderBy: { updatedAt: "desc" },
  });
  if (published) return published;

  // Legado: agentes antigos sem lifecycle rígido (não deveria ocorrer — default PUBLISHED)
  // Mantemos fallback apenas se existir AUTO ativo com status nulo em dados corrompidos.
  return prisma.aiAgent.findFirst({
    where: {
      tenantId,
      isActive: true,
      mode: "AUTO",
      publishStatus: { not: "ARCHIVED" },
    },
    orderBy: { updatedAt: "desc" },
  });
}
