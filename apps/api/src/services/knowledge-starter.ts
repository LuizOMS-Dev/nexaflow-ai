/**
 * Conhecimento inicial da EMPRESA (tenant) — não confundir com planos de assinatura NexaFlow.
 * "Planos e preços" = modelo comercial do cliente (produtos/serviços/preços dele).
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";

export const STARTER_PLANS_TITLE = "Planos e preços";
export const LEGACY_PLANS_TITLES = [
  "Planos e preços NexaFlow",
  "Catálogo comercial oficial",
] as const;

/** Marcadores do template de exemplo — se presentes, bloquear publicação. */
export const STARTER_PLANS_PLACEHOLDERS = [
  "Recurso ou serviço 1",
  "Recurso ou serviço 2",
  "Recurso ou serviço 3",
  "Recurso ou serviço adicional",
  "Personalize este conteúdo",
  "Remova todas as informações de exemplo",
  "Valor: R$ 99,00 por mês",
  "Valor: R$ 199,00 por mês",
] as const;

export const STARTER_PLANS_CONTENT = `PLANO BÁSICO
Valor: R$ 99,00 por mês

Inclui:
- Recurso ou serviço 1
- Recurso ou serviço 2
- Recurso ou serviço 3

PLANO PROFISSIONAL
Valor: R$ 199,00 por mês

Inclui:
- Todos os recursos do Plano Básico
- Recurso ou serviço adicional
- Atendimento prioritário

CONDIÇÕES DE PAGAMENTO
- Pix
- Cartão
- Boleto

INFORMAÇÕES IMPORTANTES
- Personalize este conteúdo com os planos, produtos, serviços e preços reais da sua empresa.
- Remova todas as informações de exemplo antes de publicar.`;

/** Prefixo em sourceUrl para marcar seed (sem nova coluna). */
export const STARTER_SOURCE_URL = "nexaflow:starter:plans-prices:v1";

type TenantSettings = Record<string, unknown> & {
  knowledgeStarter?: {
    plansPrices?: "seeded" | "removed";
    plansPricesSeededAt?: string;
  };
};

export function hasStarterPlaceholders(content: string): boolean {
  const c = content || "";
  return STARTER_PLANS_PLACEHOLDERS.some((m) => c.includes(m));
}

export function isLegacyNexaflowCatalogContent(content: string): boolean {
  const c = (content || "").toLowerCase();
  return (
    c.includes("catálogo comercial oficial") ||
    c.includes("sincronizado com a plataforma") ||
    c.includes("créditos de ia") ||
    c.includes("créditos ia") ||
    c.includes("administração → planos") ||
    c.includes("trial profissional") ||
    (c.includes("pague 10") && c.includes("use 12"))
  );
}

function readSettings(raw: unknown): TenantSettings {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? ({ ...(raw as object) } as TenantSettings)
    : {};
}

async function setStarterFlag(
  tenantId: string,
  plansPrices: "seeded" | "removed"
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  if (!tenant) return;
  const prev = readSettings(tenant.settings);
  const knowledgeStarter = {
    ...(prev.knowledgeStarter || {}),
    plansPrices,
    ...(plansPrices === "seeded"
      ? { plansPricesSeededAt: new Date().toISOString() }
      : {}),
  };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: asInputJson({
        ...prev,
        knowledgeStarter,
      }),
    },
  });
}

/**
 * Cria "Planos e preços" uma única vez por empresa (draft, manual).
 * Não recria se excluído (flag plansPrices = removed|seeded).
 */
export async function ensureStarterPlansKnowledge(
  tenantId: string
): Promise<{ created: boolean; migrated: boolean; id?: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, settings: true },
  });
  if (!tenant) return { created: false, migrated: false };

  const settings = readSettings(tenant.settings);
  const flag = settings.knowledgeStarter?.plansPrices;

  // Já semeado ou removido pelo usuário — nunca recriar
  if (flag === "seeded" || flag === "removed") {
    // Ainda tenta migrar legado SYSTEM se existir e for o catálogo NexaFlow
    const migrated = await migrateLegacyPlansDocIfNeeded(tenantId);
    return { created: false, migrated: migrated.migrated, id: migrated.id };
  }

  // Existe algum doc com título novo ou legado?
  const existing = await prisma.knowledgeDoc.findFirst({
    where: {
      tenantId,
      OR: [
        { title: STARTER_PLANS_TITLE },
        { title: { in: [...LEGACY_PLANS_TITLES] } },
        { sourceUrl: STARTER_SOURCE_URL },
        { sourceType: "system", title: { contains: "Planos" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const migrated = await migrateLegacyPlansDocIfNeeded(tenantId, existing.id);
    await setStarterFlag(tenantId, "seeded");
    return { created: false, migrated: migrated.migrated, id: existing.id };
  }

  const doc = await prisma.knowledgeDoc.create({
    data: {
      tenantId,
      title: STARTER_PLANS_TITLE,
      content: STARTER_PLANS_CONTENT,
      category: "Comercial",
      status: "draft",
      sourceType: "manual",
      sourceUrl: STARTER_SOURCE_URL,
      scope: "all",
      syncedAt: null,
    },
  });

  await setStarterFlag(tenantId, "seeded");
  return { created: true, migrated: false, id: doc.id };
}

/**
 * Migra doc SYSTEM/legado de catálogo NexaFlow → template empresa em rascunho
 * SE o conteúdo ainda for o catálogo da plataforma (não personalizado).
 * Se personalizado: só converte para manual e limpa source system (preserva texto).
 */
function isPlansRelatedDoc(doc: {
  title?: string | null;
  sourceUrl?: string | null;
  content?: string | null;
  sourceType?: string | null;
}): boolean {
  const title = (doc.title || "").trim();
  if (title === STARTER_PLANS_TITLE) return true;
  if (LEGACY_PLANS_TITLES.includes(title as (typeof LEGACY_PLANS_TITLES)[number])) return true;
  if ((doc.sourceUrl || "") === STARTER_SOURCE_URL) return true;
  if (title.toLowerCase().includes("planos") && title.toLowerCase().includes("preço")) return true;
  if (isLegacyNexaflowCatalogContent(doc.content || "")) return true;
  // SYSTEM legado típico do catálogo de assinatura
  if (
    doc.sourceType === "system" &&
    (title.toLowerCase().includes("plano") ||
      title.toLowerCase().includes("catálogo") ||
      title.toLowerCase().includes("catalogo"))
  ) {
    return true;
  }
  return false;
}

export async function migrateLegacyPlansDocIfNeeded(
  tenantId: string,
  docId?: string
): Promise<{ migrated: boolean; id?: string }> {
  const docs = await prisma.knowledgeDoc.findMany({
    where: {
      tenantId,
      ...(docId
        ? { id: docId }
        : {
            OR: [
              { title: { in: [...LEGACY_PLANS_TITLES, STARTER_PLANS_TITLE] } },
              { sourceUrl: STARTER_SOURCE_URL },
              {
                sourceType: "system",
                OR: [
                  { title: { contains: "Plano", mode: "insensitive" } },
                  { title: { contains: "Catálogo", mode: "insensitive" } },
                  { title: { contains: "Catalogo", mode: "insensitive" } },
                ],
              },
            ],
          }),
    },
  });

  let any = false;
  let lastId: string | undefined;

  for (const doc of docs) {
    if (!isPlansRelatedDoc(doc)) continue;

    const looksLikePlatformCatalog =
      doc.sourceType === "system" ||
      LEGACY_PLANS_TITLES.includes(doc.title as (typeof LEGACY_PLANS_TITLES)[number]) ||
      isLegacyNexaflowCatalogContent(doc.content);

    if (!looksLikePlatformCatalog && doc.title === STARTER_PLANS_TITLE) {
      // Já é o modelo da empresa
      if (doc.sourceType === "system") {
        await prisma.knowledgeDoc.update({
          where: { id: doc.id },
          data: { sourceType: "manual", syncedAt: null },
        });
        any = true;
      }
      lastId = doc.id;
      continue;
    }

    if (!looksLikePlatformCatalog) continue;

    // Só sobrescreve se o texto ainda for catálogo NexaFlow / placeholders de exemplo.
    // Conteúdo personalizado da empresa NUNCA é apagado — só tira SYSTEM.
    const unpersonalized =
      isLegacyNexaflowCatalogContent(doc.content) ||
      hasStarterPlaceholders(doc.content) ||
      !(doc.content || "").trim();

    if (unpersonalized) {
      // Substituir pelo template em rascunho
      await prisma.knowledgeDoc.update({
        where: { id: doc.id },
        data: {
          title: STARTER_PLANS_TITLE,
          content: STARTER_PLANS_CONTENT,
          category: "Comercial",
          status: "draft",
          sourceType: "manual",
          sourceUrl: STARTER_SOURCE_URL,
          syncedAt: null,
          scope: doc.scope || "all",
        },
      });
    } else {
      // Personalizado: preservar conteúdo, só tirar SYSTEM e renomear se legado
      await prisma.knowledgeDoc.update({
        where: { id: doc.id },
        data: {
          title:
            doc.title === "Planos e preços NexaFlow" ||
            doc.title === "Catálogo comercial oficial"
              ? STARTER_PLANS_TITLE
              : doc.title,
          sourceType: "manual",
          sourceUrl: doc.sourceUrl?.startsWith("nexaflow:starter")
            ? doc.sourceUrl
            : null,
          syncedAt: null,
        },
      });
    }
    any = true;
    lastId = doc.id;
  }

  return { migrated: any, id: lastId };
}

/** Marca flag removed quando o usuário exclui o template (não recriar). */
export async function markStarterPlansRemovedIfMatch(
  tenantId: string,
  doc: { title?: string | null; sourceUrl?: string | null; sourceType?: string | null }
) {
  const title = (doc.title || "").trim();
  const isStarter =
    title === STARTER_PLANS_TITLE ||
    LEGACY_PLANS_TITLES.includes(title as (typeof LEGACY_PLANS_TITLES)[number]) ||
    (doc.sourceUrl || "") === STARTER_SOURCE_URL;

  if (!isStarter) return;
  await setStarterFlag(tenantId, "removed");
}

/**
 * Provisionamento inicial de knowledge da empresa.
 * - Cria template Planos e preços (draft) uma vez
 * - NÃO sobrescreve docs existentes
 * - NÃO lê tabela Plan
 */
export async function provisionTenantKnowledge(tenantId: string) {
  return ensureStarterPlansKnowledge(tenantId);
}

/** Outros docs de treino opcionais (sem preços NexaFlow). Só cria se não existirem. */
export async function ensureOptionalTrainingDocs(tenantId: string) {
  /**
   * FAQ e Políticas são regras operacionais (sem placeholders de preço).
   * Criar já como "ready" para o autoatendimento usar imediatamente.
   * "Planos e preços" continua draft até o cliente personalizar.
   */
  const extras: Array<{
    title: string;
    category: string;
    content: string;
    status: "draft" | "ready";
  }> = [
    {
      title: "FAQ atendimento WhatsApp",
      category: "Suporte",
      status: "ready",
      content: `COMO FUNCIONA O ATENDIMENTO
- No modo automático, a IA responde no WhatsApp quando não há humano na conversa.
- Se um atendente assumir, a IA para até a conversa ser devolvida ou o cliente pedir ajuda de novo (conforme Configurações → Atendimento).

PEDIDOS FREQUENTES
- Cliente pede humano / atendente / gerente: ofereça transferir e use o handoff da plataforma.
- Dúvidas de preço/produto: use somente o que estiver no Conhecimento com status Pronto (nunca invente).
- Fora do horário: informe que a equipe retorna no próximo horário comercial (complete com o horário real da empresa em Configurações ou neste documento).

WHATSAPP
- Conexão: painel Canais / Integrações, via QR Code.
- Se o canal estiver desconectado, a IA não consegue enviar mensagens.`,
    },
    {
      title: "Políticas e regras internas",
      category: "Políticas",
      status: "ready",
      content: `REGRAS OBRIGATÓRIAS DO AGENTE
- Fale apenas do negócio da empresa.
- Use somente preços, prazos e políticas que estiverem no Conhecimento com status Pronto.
- Se não souber um fato: diga que não encontrou informação confirmada e ofereça encaminhar a um humano. Nunca invente. Nunca diga "vou verificar depois" sem ação real.
- Pedidos de desconto, contrato, pagamento ou dados sensíveis: encaminhe a um humano.
- Assuntos fora do negócio: recuse com educação e volte ao atendimento.
- Linguagem: português do Brasil, clara e curta no WhatsApp.`,
    },
  ];

  for (const doc of extras) {
    const exists = await prisma.knowledgeDoc.findFirst({
      where: { tenantId, title: doc.title },
      select: { id: true, status: true, content: true },
    });
    if (exists) {
      // Auto-cura: FAQ/políticas legadas em draft sem placeholders → ready
      if (
        exists.status === "draft" &&
        doc.status === "ready" &&
        !hasStarterPlaceholders(exists.content || "")
      ) {
        await prisma.knowledgeDoc.update({
          where: { id: exists.id },
          data: { status: "ready" },
        });
      }
      continue;
    }
    await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: doc.title,
        content: doc.content,
        category: doc.category,
        status: doc.status,
        sourceType: "manual",
        scope: "all",
      },
    });
  }
}

/**
 * Auto-cura: publica docs operacionais (sem placeholders de exemplo) que ainda estão em rascunho.
 * Nunca publica "Planos e preços" com template de exemplo.
 */
export async function ensureOperationalKnowledgeReady(tenantId: string): Promise<{
  published: number;
}> {
  await ensureOptionalTrainingDocs(tenantId);

  const drafts = await prisma.knowledgeDoc.findMany({
    where: {
      tenantId,
      status: "draft",
      NOT: { sourceType: "system" },
    },
    select: { id: true, title: true, content: true, sourceUrl: true },
  });

  let published = 0;
  for (const d of drafts) {
    const isPlansTemplate =
      d.title === STARTER_PLANS_TITLE ||
      (d.sourceUrl || "") === STARTER_SOURCE_URL ||
      hasStarterPlaceholders(d.content || "");
    if (isPlansTemplate) continue;

    // só docs curtos/operacionais ou explicitamente FAQ/políticas
    const title = (d.title || "").toLowerCase();
    const operational =
      title.includes("faq") ||
      title.includes("política") ||
      title.includes("politica") ||
      title.includes("regra") ||
      title.includes("atendimento") ||
      title.includes("whatsapp");
    if (!operational) continue;

    await prisma.knowledgeDoc.update({
      where: { id: d.id },
      data: { status: "ready" },
    });
    published += 1;
  }
  return { published };
}
