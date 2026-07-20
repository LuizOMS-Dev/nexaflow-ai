/**
 * Factory reset: apaga TODAS as contas/empresas/dados e cria 1 superadmin limpo.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx apps/api/src/scripts/factory-reset.ts
 *
 * Env obrigatórias:
 *   CONFIRM_FACTORY_RESET=DELETE_ALL_DATA
 *   SEED_SUPERADMIN_EMAIL
 *   SEED_SUPERADMIN_PASSWORD (mín. 16 caracteres e 3 classes)
 * Env opcionais:
 *   SEED_SUPERADMIN_NAME (default: Super Admin)
 *   KEEP_PLANS=1 (mantém planos; default mantém)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hashPassword(password: string) {
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

async function safeDeleteMany(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    console.log(`  · ${label} (skip: ${e instanceof Error ? e.message.slice(0, 80) : e})`);
  }
}

async function main() {
  const email = (process.env.SEED_SUPERADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD || "";
  const name = process.env.SEED_SUPERADMIN_NAME || "Super Admin";
  const passwordClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rule) =>
    rule.test(password)
  ).length;

  if (process.env.CONFIRM_FACTORY_RESET !== "DELETE_ALL_DATA") {
    throw new Error(
      "Reset abortado: defina CONFIRM_FACTORY_RESET=DELETE_ALL_DATA para confirmar a exclusão."
    );
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Reset abortado: defina SEED_SUPERADMIN_EMAIL com um e-mail válido.");
  }
  if (password.length < 16 || passwordClasses < 3) {
    throw new Error(
      "Reset abortado: SEED_SUPERADMIN_PASSWORD deve ter ao menos 16 caracteres e 3 classes de caracteres."
    );
  }

  console.log("🧹 Factory reset NexaFlow — limpando tudo...");
  console.log(`   DATABASE_URL=${(process.env.DATABASE_URL || "").replace(/:[^:@/]+@/, ":***@")}`);

  // Ordem: dependentes → raiz
  await safeDeleteMany("messages", () => prisma.message.deleteMany({}));
  await safeDeleteMany("notes", () => prisma.note.deleteMany({}));
  await safeDeleteMany("tasks", () => prisma.task.deleteMany({}));
  await safeDeleteMany("opportunityHistory", () => prisma.opportunityHistory.deleteMany({}));
  await safeDeleteMany("opportunities", () => prisma.opportunity.deleteMany({}));
  await safeDeleteMany("conversations", () => prisma.conversation.deleteMany({}));
  await safeDeleteMany("contactTags", () => prisma.contactTag.deleteMany({}));
  await safeDeleteMany("contactMemory", () => prisma.contactMemory.deleteMany({}));
  await safeDeleteMany("contactScoreHistory", () => prisma.contactScoreHistory.deleteMany({}));
  await safeDeleteMany("recommendationDecisions", () => prisma.recommendationDecision.deleteMany({}));
  await safeDeleteMany("contacts", () => prisma.contact.deleteMany({}));
  await safeDeleteMany("channels", () => prisma.channel.deleteMany({}));
  await safeDeleteMany("automationRuns", () => prisma.automationRun.deleteMany({}));
  await safeDeleteMany("automations", () => prisma.automation.deleteMany({}));
  await safeDeleteMany("campaigns", () => prisma.campaign.deleteMany({}));
  await safeDeleteMany("knowledgeChunks", () => prisma.knowledgeChunk.deleteMany({}));
  await safeDeleteMany("knowledgeDocs", () => prisma.knowledgeDoc.deleteMany({}));
  await safeDeleteMany("webhookDeliveries", () => prisma.webhookDelivery.deleteMany({}));
  await safeDeleteMany("webhookEndpoints", () => prisma.webhookEndpoint.deleteMany({}));
  await safeDeleteMany("aiAgents", () => prisma.aiAgent.deleteMany({}));
  await safeDeleteMany("quickReplies", () => prisma.quickReply.deleteMany({}));
  await safeDeleteMany("tags", () => prisma.tag.deleteMany({}));
  await safeDeleteMany("customFields", () => prisma.customField.deleteMany({}));
  await safeDeleteMany("pipelineStages", () => prisma.pipelineStage.deleteMany({}));
  await safeDeleteMany("pipelines", () => prisma.pipeline.deleteMany({}));
  await safeDeleteMany("notifications", () => prisma.notification.deleteMany({}));
  await safeDeleteMany("auditLogs", () => prisma.auditLog.deleteMany({}));
  await safeDeleteMany("securityEvents", () => prisma.securityEvent.deleteMany({}));
  await safeDeleteMany("userInvites", () => prisma.userInvite.deleteMany({}));
  await safeDeleteMany("refreshTokens", () => prisma.refreshToken.deleteMany({}));
  await safeDeleteMany("authSessions", () => prisma.authSession.deleteMany({}));
  await safeDeleteMany("mfaChallenges", () => prisma.mfaChallenge.deleteMany({}));
  await safeDeleteMany("loginAttempts", () => prisma.loginAttempt.deleteMany({}));
  await safeDeleteMany("passwordResetTokens", () => prisma.passwordResetToken.deleteMany({}));
  await safeDeleteMany("subscriptions", () => prisma.subscription.deleteMany({}));
  await safeDeleteMany("memberships", () => prisma.membership.deleteMany({}));
  await safeDeleteMany("users", () => prisma.user.deleteMany({}));
  await safeDeleteMany("tenants", () => prisma.tenant.deleteMany({}));

  // Planos: catálogo oficial único (mesmos preços do seed / packages/db official-plans)
  const { OFFICIAL_PLANS } = await import("@nexaflow/db");
  const { asInputJson } = await import("../lib/json");
  for (const plan of OFFICIAL_PLANS) {
    const features = asInputJson(plan.features);
    await prisma.plan.upsert({
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
        features,
      },
      create: {
        slug: plan.slug,
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
        features,
      },
    });
  }
  const free = await prisma.plan.findUnique({ where: { slug: "free" } });
  if (!free) throw new Error("factory-reset: plano free ausente após sync");

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

  const passwordHash = await hashPassword(password);
  const superadmin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      platformRole: "SUPERADMIN",
    },
  });

  // Sem empresa/tenant: superadmin puro da plataforma
  const userCount = await prisma.user.count();
  const tenantCount = await prisma.tenant.count();

  console.log("");
  console.log("✅ Reset concluído");
  console.log(`   Users: ${userCount} | Tenants: ${tenantCount}`);
  console.log(`   Superadmin: ${superadmin.email}`);
  console.log(`   Nome: ${superadmin.name}`);
  console.log(`   Plano free id: ${free.id}`);
  console.log("");
  console.log("   Login em http://localhost:3000/login → /admin");
  console.log("   (Nenhuma empresa criada — plataforma limpa)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
