/**
 * Factory reset de produção: apaga empresas, usuários de tenant e dados de negócio.
 * Mantém catálogo (planos, releases, custos de plataforma, knowledge da NIA).
 *
 * Uso:
 *   CONFIRM_FACTORY_RESET=DELETE_ALL_DATA KEEP_EXISTING_SUPERADMINS=1 \
 *     npx tsx apps/api/src/scripts/factory-reset.ts
 *
 * Ou recria 1 superadmin:
 *   CONFIRM_FACTORY_RESET=DELETE_ALL_DATA \
 *   SEED_SUPERADMIN_EMAIL=... SEED_SUPERADMIN_PASSWORD=... \
 *     npx tsx apps/api/src/scripts/factory-reset.ts
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

async function safe(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`  ok  ${label}`);
  } catch (e) {
    console.log(`  skip ${label}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
  }
}

async function main() {
  const keepAdmins = process.env.KEEP_EXISTING_SUPERADMINS === "1";
  const email = (process.env.SEED_SUPERADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD || "";
  const name = process.env.SEED_SUPERADMIN_NAME || "Super Admin";

  if (process.env.CONFIRM_FACTORY_RESET !== "DELETE_ALL_DATA") {
    throw new Error("Abortado: defina CONFIRM_FACTORY_RESET=DELETE_ALL_DATA.");
  }
  if (!keepAdmins) {
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Abortado: SEED_SUPERADMIN_EMAIL inválido.");
    }
    if (password.length < 16 || classes < 3) {
      throw new Error("Abortado: SEED_SUPERADMIN_PASSWORD fraca (16+ e 3 classes).");
    }
  }

  const before = {
    users: await prisma.user.count(),
    tenants: await prisma.tenant.count(),
    superadmins: await prisma.user.count({ where: { platformRole: "SUPERADMIN" } }),
  };
  console.log("Limpando NexaFlow (empresas + usuários de tenant)...");
  console.log(`  antes: users=${before.users} tenants=${before.tenants} superadmins=${before.superadmins}`);

  await safe("messages", () => prisma.message.deleteMany({}));
  await safe("notes", () => prisma.note.deleteMany({}));
  await safe("tasks", () => prisma.task.deleteMany({}));
  await safe("opportunityHistory", () => prisma.opportunityHistory.deleteMany({}));
  await safe("opportunities", () => prisma.opportunity.deleteMany({}));
  await safe("conversations", () => prisma.conversation.deleteMany({}));
  await safe("contactTags", () => prisma.contactTag.deleteMany({}));
  await safe("contactMemory", () => prisma.contactMemory.deleteMany({}));
  await safe("contactScoreHistory", () => prisma.contactScoreHistory.deleteMany({}));
  await safe("recommendationDecisions", () => prisma.recommendationDecision.deleteMany({}));
  await safe("contacts", () => prisma.contact.deleteMany({}));
  await safe("channels", () => prisma.channel.deleteMany({}));
  await safe("automationRuns", () => prisma.automationRun.deleteMany({}));
  await safe("automations", () => prisma.automation.deleteMany({}));
  await safe("campaigns", () => prisma.campaign.deleteMany({}));
  await safe("knowledgeChunks", () => prisma.knowledgeChunk.deleteMany({}));
  await safe("agentKnowledge", () => prisma.agentKnowledge.deleteMany({}));
  await safe("knowledgeDocs", () => prisma.knowledgeDoc.deleteMany({}));
  await safe("knowledgeGaps", () => prisma.knowledgeGap.deleteMany({}));
  await safe("learningSuggestions", () => prisma.learningSuggestion.deleteMany({}));
  await safe("agentFeedbacks", () => prisma.agentFeedback.deleteMany({}));
  await safe("agentTestRuns", () => prisma.agentTestRun.deleteMany({}));
  await safe("agentTestCases", () => prisma.agentTestCase.deleteMany({}));
  await safe("agentToolExecutions", () => prisma.agentToolExecution.deleteMany({}));
  await safe("agentVersions", () => prisma.agentVersion.deleteMany({}));
  await safe("aiAgents", () => prisma.aiAgent.deleteMany({}));
  await safe("tenantAiConfig", () => prisma.tenantAiConfig.deleteMany({}));
  await safe("webhookDeliveries", () => prisma.webhookDelivery.deleteMany({}));
  await safe("webhookEndpoints", () => prisma.webhookEndpoint.deleteMany({}));
  await safe("apiUsageLogs", () => prisma.apiUsageLog.deleteMany({}));
  await safe("apiKeys", () => prisma.apiKey.deleteMany({}));
  await safe("aiUsageLogs", () => prisma.aiUsageLog.deleteMany({}));
  await safe("quickReplies", () => prisma.quickReply.deleteMany({}));
  await safe("tags", () => prisma.tag.deleteMany({}));
  await safe("customFields", () => prisma.customField.deleteMany({}));
  await safe("pipelineStages", () => prisma.pipelineStage.deleteMany({}));
  await safe("pipelines", () => prisma.pipeline.deleteMany({}));
  await safe("notifications", () => prisma.notification.deleteMany({}));
  await safe("auditLogs", () => prisma.auditLog.deleteMany({}));
  await safe("securityEvents", () => prisma.securityEvent.deleteMany({}));
  await safe("userInvites", () => prisma.userInvite.deleteMany({}));
  await safe("refreshTokens", () => prisma.refreshToken.deleteMany({}));
  await safe("authSessions", () => prisma.authSession.deleteMany({}));
  await safe("mfaChallenges", () => prisma.mfaChallenge.deleteMany({}));
  await safe("loginAttempts", () => prisma.loginAttempt.deleteMany({}));
  await safe("passwordResetTokens", () => prisma.passwordResetToken.deleteMany({}));
  await safe("helpAssistantMessages", () => prisma.helpAssistantMessage.deleteMany({}));
  await safe("helpAssistantThreads", () => prisma.helpAssistantThread.deleteMany({}));
  await safe("helpKnowledgeGaps", () => prisma.helpKnowledgeGap.deleteMany({}));
  await safe("userReleaseSeen", () => prisma.userReleaseSeen.deleteMany({}));
  await safe("deployments", () => prisma.deployment.deleteMany({}));
  await safe("salesLeads", () => prisma.salesLead.deleteMany({}));
  await safe("payments", () => prisma.payment.deleteMany({}));
  await safe("tenantCharges", () => prisma.tenantCharge.deleteMany({}));
  await safe("tenantCosts", () => prisma.tenantCost.deleteMany({}));
  await safe("subscriptions", () => prisma.subscription.deleteMany({}));
  await safe("companyProfiles", () => prisma.companyProfile.deleteMany({}));
  await safe("memberships", () => prisma.membership.deleteMany({}));

  if (keepAdmins) {
    await safe("tenant users", () =>
      prisma.user.deleteMany({ where: { NOT: { platformRole: "SUPERADMIN" } } })
    );
  } else {
    await safe("users", () => prisma.user.deleteMany({}));
  }

  await safe("tenants", () => prisma.tenant.deleteMany({}));

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

  if (!keepAdmins) {
    const passwordHash = await hashPassword(password);
    await prisma.user.create({
      data: { email, passwordHash, name, platformRole: "SUPERADMIN" },
    });
  }

  const after = {
    users: await prisma.user.count(),
    tenants: await prisma.tenant.count(),
    contacts: await prisma.contact.count(),
    superadmins: await prisma.user.findMany({
      where: { platformRole: "SUPERADMIN" },
      select: { email: true, name: true },
    }),
  };
  if (after.tenants !== 0) throw new Error(`Reset incompleto: ainda há ${after.tenants} empresas.`);
  if (keepAdmins && after.superadmins.length === 0) {
    throw new Error("Reset incompleto: nenhum SUPERADMIN restou. Crie um via seed.");
  }

  console.log("");
  console.log("Reset concluído.");
  console.log(`  users=${after.users} tenants=${after.tenants} contacts=${after.contacts}`);
  console.log(`  superadmins: ${after.superadmins.map((u) => u.email).join(", ") || "(nenhum)"}`);
  console.log("  Planos oficiais sincronizados. Nenhuma empresa no sistema.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
