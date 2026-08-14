import { PrismaClient, MemberRole, AiMode } from "@prisma/client";
import bcrypt from "bcryptjs";

async function hashSeedPassword(password: string) {
  try {
    const argon2 = await import("argon2");
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  } catch {
    return bcrypt.hash(password, 12);
  }
}

const prisma = new PrismaClient();

function requireSeedCredentials() {
  const email = (process.env.SEED_SUPERADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD || "";
  const adminName = (process.env.SEED_SUPERADMIN_NAME || "Super Admin").trim();
  const passwordClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rule) =>
    rule.test(password)
  ).length;

  if (!email || !password) {
    throw new Error(
      "Seed abortado: defina SEED_SUPERADMIN_EMAIL e SEED_SUPERADMIN_PASSWORD explicitamente."
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Seed abortado: SEED_SUPERADMIN_EMAIL inválido.");
  }
  if (password.length < 16 || passwordClasses < 3) {
    throw new Error(
      "Seed abortado: SEED_SUPERADMIN_PASSWORD deve ter ao menos 16 caracteres e 3 classes de caracteres."
    );
  }

  return { email, password, adminName };
}

/**
 * Seed para uso real â€” NUNCA cria contatos, conversas, canais ou leads fictÃ­cios.
 * Apenas: planos, admin, 1 empresa vazia, funil CRM, tags, 1 agente IA, respostas rÃ¡pidas.
 */
async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_ENABLED !== "true") {
    console.error("ABORT: seed em production exige SEED_DEMO_ENABLED=true");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "test") {
    console.error("ABORT: seed não deve rodar em NODE_ENV=test (use fixtures de teste).");
    process.exit(1);
  }
  const { email, password, adminName } = requireSeedCredentials();
  console.log("🌱 NexaFlow seed (uso real)...");

  /** Catálogo comercial oficial — packages/db/src/official-plans.ts (idempotente por slug) */
  const { OFFICIAL_PLANS } = await import("../src/official-plans");

  let free = await prisma.plan.findUnique({ where: { slug: "free" } });
  for (const plan of OFFICIAL_PLANS) {
    const row = await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceAnnual: plan.priceAnnual,
        priceOnRequest: plan.priceOnRequest,
        maxUsers: plan.maxUsers,
        maxChannels: plan.maxChannels,
        maxContacts: plan.maxContacts,
        maxConversations: plan.maxConversations,
        maxAiMessages: plan.maxAiMessages,
        badge: plan.badge,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
        features: plan.features,
      },
      create: {
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceAnnual: plan.priceAnnual,
        priceOnRequest: plan.priceOnRequest,
        maxUsers: plan.maxUsers,
        maxChannels: plan.maxChannels,
        maxContacts: plan.maxContacts,
        maxConversations: plan.maxConversations,
        maxAiMessages: plan.maxAiMessages,
        badge: plan.badge,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
        features: plan.features,
      },
    });
    if (plan.slug === "free") free = row;
  }

  if (!free) {
    free = await prisma.plan.findFirst({ where: { slug: "starter" } });
  }
  if (!free) throw new Error("Seed: plano free/starter ausente");

  const passwordHash = await hashSeedPassword(password);

  const superadmin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, platformRole: "SUPERADMIN", name: adminName },
    create: {
      email,
      passwordHash,
      name: adminName,
      platformRole: "SUPERADMIN",
    },
  });

  /**
   * Plataforma limpa por padrão: só superadmin + planos.
   * Empresa demo só se SEED_CREATE_TENANT=1 (evita recriar "Minha Empresa" a cada boot).
   */
  const createTenant =
    process.env.SEED_CREATE_TENANT === "1" || process.env.SEED_CREATE_TENANT === "true";

  if (!createTenant) {
    await prisma.platformSetting.upsert({
      where: { key: "branding" },
      update: {
        value: {
          name: "NexaFlow AI",
          primaryColor: "#6366f1",
          supportEmail: process.env.NEXAFLOW_SUPPORT_EMAIL || null,
        },
      },
      create: {
        key: "branding",
        value: {
          name: "NexaFlow AI",
          primaryColor: "#6366f1",
          supportEmail: process.env.NEXAFLOW_SUPPORT_EMAIL || null,
        },
      },
    });

    const userCount = await prisma.user.count();
    const tenantCount = await prisma.tenant.count();
    console.log("✅ Seed plataforma limpa (sem empresa demo)");
    console.log(`   Users: ${userCount} | Tenants: ${tenantCount}`);
    console.log("Superadmin configurado:", email);
    console.log("Acesse /admin como SUPERADMIN (sem tenant).");
    return;
  }

  const companyName = process.env.SEED_COMPANY_NAME || "Minha Empresa";
  const tenantSlug = process.env.SEED_TENANT_SLUG || "minha-empresa";

  // Não sobrescreve empresa já usada no onboarding: reaproveita membership ativa do admin
  const existingMembership = await prisma.membership.findFirst({
    where: { userId: superadmin.id, isActive: true },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  let tenant =
    existingMembership?.tenant ||
    (await prisma.tenant.findUnique({ where: { slug: tenantSlug } }));

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: companyName,
        slug: tenantSlug,
        status: "ACTIVE",
        planId: free.id,
        primaryColor: "#6366f1",
        settings: {
          timezone: "America/Sao_Paulo",
          language: "pt-BR",
          businessHours: { start: "08:00", end: "18:00" },
          onboardingCompleted: false,
        },
      },
    });
  } else {
    // Mantém o nome da empresa do cliente; só garante plano/status
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "ACTIVE", planId: free.id },
    });
  }

  // Admin sempre ADMIN na empresa principal — NÃO apaga outras memberships (evita sumir agente)
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: superadmin.id } },
    update: { role: MemberRole.ADMIN, isActive: true },
    create: { tenantId: tenant.id, userId: superadmin.id, role: MemberRole.ADMIN },
  });

  // Tags (sem vocabulário quente/morno/frio)
  for (const t of [
    { name: "Alta prioridade", color: "#ef4444" },
    { name: "Suporte", color: "#3b82f6" },
    { name: "Novo lead", color: "#22c55e" },
  ]) {
    await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: t.name } },
      update: { color: t.color },
      create: { tenantId: tenant.id, name: t.name, color: t.color },
    });
  }

  // Funil CRM — idempotente: no máximo um default por tenant
  const existingDefault = await prisma.pipeline.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
  });
  if (!existingDefault) {
    const anyPipeline = await prisma.pipeline.findFirst({ where: { tenantId: tenant.id } });
    if (!anyPipeline) {
      await prisma.pipeline.create({
        data: {
          tenantId: tenant.id,
          name: "Funil Comercial",
          isDefault: true,
          stages: {
            create: [
              { name: "Novos leads", color: "#94a3b8", position: 0, probability: 10 },
              { name: "Em atendimento", color: "#3b82f6", position: 1, probability: 25 },
              { name: "Qualificado", color: "#8b5cf6", position: 2, probability: 40 },
              { name: "Proposta enviada", color: "#f59e0b", position: 3, probability: 60 },
              { name: "Negociação", color: "#f97316", position: 4, probability: 75 },
              { name: "Pagamento pendente", color: "#eab308", position: 5, probability: 90 },
              { name: "Venda concluída", color: "#22c55e", position: 6, probability: 100, isWon: true },
              { name: "Perdido", color: "#ef4444", position: 7, probability: 0, isLost: true },
            ],
          },
        },
      });
    } else {
      await prisma.pipeline.update({
        where: { id: anyPipeline.id },
        data: { isDefault: true },
      });
    }
  }

  // Respostas rápidas
  const qrCount = await prisma.quickReply.count({ where: { tenantId: tenant.id } });
  if (qrCount === 0) {
    await prisma.quickReply.createMany({
      data: [
        { tenantId: tenant.id, title: "Saudação", content: "Olá! Como posso ajudar?", shortcut: "/ola" },
        {
          tenantId: tenant.id,
          title: "Horário",
          content: "Nosso atendimento funciona de segunda a sexta, das 8h às 18h.",
          shortcut: "/horario",
        },
        {
          tenantId: tenant.id,
          title: "Aguarde",
          content: "Só um momento, estou verificando essa informação para você.",
          shortcut: "/aguarde",
        },
      ],
    });
  }

  // 1 agente IA — Ana em TODAS as empresas ativas (evita “nenhum agente” por tenant errado)
  const allTenants = await prisma.tenant.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true, name: true },
  });
  if (!allTenants.some((t) => t.id === tenant.id)) {
    allTenants.push({ id: tenant.id, name: tenant.name });
  }

  for (const t of allTenants) {
    await ensureAnaForTenant(t.id, t.name);
  }

  console.log(`🤖 Agente Ana garantido em ${allTenants.length} empresa(s)`);

  await prisma.platformSetting.upsert({
    where: { key: "branding" },
    update: {
      value: {
        name: "NexaFlow AI",
        primaryColor: "#6366f1",
        supportEmail: process.env.NEXAFLOW_SUPPORT_EMAIL || null,
      },
    },
    create: {
      key: "branding",
      value: {
        name: "NexaFlow AI",
        primaryColor: "#6366f1",
        supportEmail: process.env.NEXAFLOW_SUPPORT_EMAIL || null,
      },
    },
  });

  // SÃ³ limpa canais/contatos se SEED_WIPE_ALL=1 (evita apagar WhatsApp a cada restart)
  if (process.env.SEED_WIPE_ALL === "1") {
    await wipeAllDemoData(tenant.id);
    console.log("ðŸ§¹ SEED_WIPE_ALL=1 â€” base zerada (canais/contatos/conversas)");
  } else {
    // Remove sÃ³ usuÃ¡rios demo antigos, sem tocar no canal WhatsApp real
    for (const demoEmail of ["atendente@demo.nexaflow.ai", "comercial@demo.nexaflow.ai"]) {
      const u = await prisma.user.findUnique({ where: { email: demoEmail } });
      if (!u) continue;
      await prisma.membership.deleteMany({ where: { userId: u.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } }).catch(() => null);
    }
  }

  console.log("âœ… Pronto para uso real");
  console.log("Superadmin configurado:", email);
  console.log("Empresa:", tenant.name);
  console.log("Agente: Ana (modo AUTO â€” responde no WhatsApp como pessoa)");
}

async function ensureAnaForTenant(tenantId: string, companyName: string) {
  const agents = await prisma.aiAgent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  const anaData = {
    name: "Ana",
    role: "Consultora comercial",
    objective:
      "Qualificar leads, explicar planos, informar preÃ§os do catÃ¡logo e fechar ou agendar prÃ³ximo passo",
    personality:
      "SimpÃ¡tica, descontraÃ­da, confiante e prestativa â€” parece humana de verdade, fala leve no WhatsApp",
    tone: "amigÃ¡vel, solto e profissional (WhatsApp do dia a dia)",
    language: "pt-BR",
    instructions: `VocÃª Ã© Ana, consultora comercial da ${companyName} no WhatsApp.
Pessoa real da equipe (nunca diga que Ã© IA/bot). Mensagens curtas, naturais.
Planos: use o catálogo oficial da plataforma (Inicial R$99, Profissional R$299, Empresa R$699, Enterprise sob consulta).
Trial Profissional 7 dias. Desconto anual 10 paga / 12 usa. PIX/cartão/boleto.
Off-topic: recuse leve (sem horÃ¡rio de trabalho) e volte ao atendimento.`,
    restrictions:
      "Nunca dizer que Ã© robÃ´/IA. Ficar no contexto do negÃ³cio. Usar catÃ¡logo de preÃ§os de treino.",
    mode: AiMode.AUTO,
    model: "llama-3.1-8b-instant",
    temperature: 0.75,
    isActive: true,
    greeting: "Oi! Tudo bem? Aqui Ã© a Ana ðŸ˜Š Como posso te ajudar?",
    farewell: "Qualquer coisa Ã© sÃ³ chamar! Foi um prazer falar com vocÃª.",
  };

  if (agents.length === 0) {
    await prisma.aiAgent.create({ data: { tenantId, ...anaData } });
  } else {
    await prisma.aiAgent.update({
      where: { id: agents[0].id },
      data: { ...anaData, name: agents[0].name || "Ana", isActive: true, mode: AiMode.AUTO },
    });
    if (agents.length > 1) {
      await prisma.aiAgent.deleteMany({ where: { tenantId, id: { not: agents[0].id } } });
    }
  }

  const docs = [
    {
      title: "Planos e preÃ§os NexaFlow",
      category: "comercial",
      content:
        "Inicial R$99 | Profissional R$299 | Empresa R$699 | Enterprise sob consulta. Trial Profissional 7 dias. Anual: pague 10 use 12. PIX/cartão/boleto.",
    },
    {
      title: "FAQ atendimento WhatsApp",
      category: "suporte",
      content:
        "Conectar WhatsApp via QR em IntegraÃ§Ãµes. IA AUTO responde sozinha; Assumir pausa a IA e avisa o cliente.",
    },
  ];
  for (const doc of docs) {
    const existing = await prisma.knowledgeDoc.findFirst({
      where: { tenantId, title: doc.title },
    });
    if (existing) {
      await prisma.knowledgeDoc.update({
        where: { id: existing.id },
        data: { content: doc.content, category: doc.category, status: "published" },
      });
    } else {
      await prisma.knowledgeDoc.create({
        data: {
          tenantId,
          title: doc.title,
          content: doc.content,
          category: doc.category,
          status: "published",
          sourceType: "text",
        },
      });
    }
  }
}

async function wipeAllDemoData(keepTenantId: string) {
  await prisma.message.deleteMany({});
  await prisma.note.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.opportunityHistory.deleteMany({});
  await prisma.opportunity.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.contactTag.deleteMany({});
  await prisma.contactMemory.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.channel.deleteMany({});
  await prisma.automation.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.knowledgeChunk.deleteMany({});
  await prisma.knowledgeDoc.deleteMany({});
  await prisma.webhookDelivery.deleteMany({});
  await prisma.webhookEndpoint.deleteMany({});
  try {
    await prisma.apiUsageLog.deleteMany({});
    await prisma.apiKey.deleteMany({});
  } catch {
    /* modelos novos podem não existir em bases antigas */
  }
  await prisma.auditLog.deleteMany({});

  for (const demoEmail of ["atendente@demo.nexaflow.ai", "comercial@demo.nexaflow.ai"]) {
    const u = await prisma.user.findUnique({ where: { email: demoEmail } });
    if (!u) continue;
    await prisma.membership.deleteMany({ where: { userId: u.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => null);
  }

  const others = await prisma.tenant.findMany({
    where: { id: { not: keepTenantId } },
  });
  for (const t of others) {
    await prisma.membership.deleteMany({ where: { tenantId: t.id } });
    await prisma.aiAgent.deleteMany({ where: { tenantId: t.id } });
    await prisma.quickReply.deleteMany({ where: { tenantId: t.id } });
    await prisma.tag.deleteMany({ where: { tenantId: t.id } });
    const pipelines = await prisma.pipeline.findMany({ where: { tenantId: t.id } });
    for (const p of pipelines) {
      await prisma.pipelineStage.deleteMany({ where: { pipelineId: p.id } });
    }
    await prisma.pipeline.deleteMany({ where: { tenantId: t.id } });
    await prisma.customField.deleteMany({ where: { tenantId: t.id } }).catch(() => null);
    await prisma.tenant.delete({ where: { id: t.id } }).catch(async () => {
      await prisma.tenant.update({
        where: { id: t.id },
        data: { status: "SUSPENDED", name: `[Arquivado] ${t.name}` },
      });
    });
  }

  const agents = await prisma.aiAgent.findMany({
    where: { tenantId: keepTenantId },
    orderBy: { createdAt: "asc" },
  });
  if (agents.length > 1) {
    await prisma.aiAgent.deleteMany({
      where: { tenantId: keepTenantId, id: { not: agents[0].id } },
    });
  }

  console.log("ðŸ§¹ Base limpa para uso real");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
