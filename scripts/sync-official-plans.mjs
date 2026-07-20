import { PrismaClient } from "@prisma/client";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load OFFICIAL_PLANS via tsx-compiled path - use dynamic import of compiled TS through node with register
const { register } = await import("node:module");
// Fallback: inline official prices (must match packages/db/src/official-plans.ts)
const OFFICIAL_PLANS = [
  {
    slug: "free",
    name: "Gratuito",
    description:
      "Plano de teste para empresas experimentarem a plataforma. Padrão em novos cadastros (sem cobrança).",
    priceMonthly: 0,
    priceAnnual: null,
    priceOnRequest: false,
    maxUsers: 2,
    maxChannels: 1,
    maxContacts: 500,
    maxConversations: 1000,
    maxAiMessages: 200,
    badge: null,
    sortOrder: 0,
    isActive: true,
    features: {
      maxAgents: 1,
      maxActiveFlows: 2,
      monthlyAiCredits: 200,
      campaignsEnabled: false,
      crm: true,
      inbox: true,
      ai: true,
    },
  },
  {
    slug: "starter",
    name: "Inicial",
    description: "Pequenos negócios organizando atendimento e vendas",
    priceMonthly: 99,
    priceAnnual: 1009.8,
    priceOnRequest: false,
    maxUsers: 2,
    maxChannels: 1,
    maxContacts: 2000,
    maxConversations: 10000,
    maxAiMessages: 1000,
    badge: null,
    sortOrder: 10,
    isActive: true,
    features: {
      maxAgents: 1,
      maxActiveFlows: 5,
      monthlyAiCredits: 1000,
      crm: true,
      inbox: true,
      ai: true,
      automations: true,
      reports: true,
    },
  },
  {
    slug: "pro",
    name: "Profissional",
    description: "Empresas ativas em WhatsApp, atendimento e vendas",
    priceMonthly: 299,
    priceAnnual: 3049.8,
    priceOnRequest: false,
    maxUsers: 5,
    maxChannels: 1,
    maxContacts: 10000,
    maxConversations: 50000,
    maxAiMessages: 5000,
    badge: "popular",
    sortOrder: 20,
    isActive: true,
    features: {
      maxAgents: 3,
      maxActiveFlows: 25,
      monthlyAiCredits: 5000,
      campaignsEnabled: true,
      crm: true,
      inbox: true,
      ai: true,
      automations: true,
      campaigns: true,
      reports: true,
    },
  },
  {
    slug: "business",
    name: "Empresa",
    description: "Operações maiores e equipes estruturadas",
    priceMonthly: 699,
    priceAnnual: 7129.8,
    priceOnRequest: false,
    maxUsers: 15,
    maxChannels: 1,
    maxContacts: 50000,
    maxConversations: 200000,
    maxAiMessages: 20000,
    badge: null,
    sortOrder: 30,
    isActive: true,
    features: {
      maxAgents: 10,
      maxActiveFlows: 100,
      monthlyAiCredits: 20000,
      campaignsEnabled: true,
      crm: true,
      inbox: true,
      ai: true,
      automations: true,
      campaigns: true,
      reports: true,
      api: true,
    },
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Grandes operações com limites personalizados",
    priceMonthly: 0,
    priceAnnual: null,
    priceOnRequest: true,
    maxUsers: 999,
    maxChannels: 1,
    maxContacts: 1_000_000,
    maxConversations: 1_000_000,
    maxAiMessages: 100_000,
    badge: null,
    sortOrder: 40,
    isActive: true,
    features: {
      maxAgents: 50,
      maxActiveFlows: 999,
      monthlyAiCredits: 100000,
      listFromPriceMonthly: 1490,
      whiteLabel: true,
      crm: true,
      inbox: true,
      ai: true,
    },
  },
];

const prisma = new PrismaClient();

for (const plan of OFFICIAL_PLANS) {
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
      features: plan.features,
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
      features: plan.features,
    },
  });
  console.log("synced", plan.slug, plan.priceMonthly, "onRequest=", plan.priceOnRequest);
}

const all = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
for (const pl of all) {
  console.log("DB", pl.slug, String(pl.priceMonthly), pl.priceOnRequest, pl.isActive);
}

await prisma.$disconnect();
