/**
 * Catálogo comercial oficial NexaFlow — fonte única de verdade do seed/reset.
 * Preços e limites em runtime vêm do banco (`Plan`); este arquivo só define o catálogo
 * idempotente aplicado por seed/factory-reset (upsert por slug).
 *
 * NÃO importar isto no frontend para exibir preços — sempre API/DB.
 */

export type OfficialPlanDef = {
  slug: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number | null;
  priceOnRequest: boolean;
  maxUsers: number;
  maxChannels: number;
  maxContacts: number;
  maxConversations: number;
  maxAiMessages: number;
  badge: string | null;
  sortOrder: number;
  isActive: boolean;
  features: Record<string, unknown>;
};

export const OFFICIAL_PLANS: OfficialPlanDef[] = [
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
    /** Ativo como plano de teste / padrão de cadastro (não entra em MRR pago) */
    isActive: true,
    features: {
      maxAgents: 1,
      maxActiveFlows: 2,
      monthlyAiCredits: 200,
      campaignsEnabled: false,
      advancedAutomationEnabled: false,
      advancedReportsEnabled: false,
      crm: true,
      inbox: true,
      ai: true,
      automations: false,
      campaigns: false,
      api: false,
      webhooks: false,
      webhooksLimit: 0,
      apiKeysLimit: 0,
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
      campaignsEnabled: false,
      advancedAutomationEnabled: false,
      advancedReportsEnabled: false,
      teamReportsEnabled: false,
      aiReportsEnabled: false,
      advancedPermissionsEnabled: false,
      prioritySupportEnabled: false,
      crm: true,
      inbox: true,
      ai: true,
      automations: true,
      campaigns: false,
      reports: true,
      api: false,
      webhooks: false,
      webhooksLimit: 0,
      apiKeysLimit: 0,
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
      advancedAutomationEnabled: true,
      advancedReportsEnabled: true,
      teamReportsEnabled: false,
      aiReportsEnabled: false,
      advancedPermissionsEnabled: false,
      prioritySupportEnabled: false,
      crm: true,
      inbox: true,
      ai: true,
      automations: true,
      campaigns: true,
      reports: true,
      api: false,
      webhooks: true,
      webhooksLimit: 5,
      apiKeysLimit: 0,
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
    maxChannels: 2,
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
      advancedAutomationEnabled: true,
      advancedReportsEnabled: true,
      teamReportsEnabled: true,
      aiReportsEnabled: true,
      advancedPermissionsEnabled: true,
      prioritySupportEnabled: true,
      crm: true,
      inbox: true,
      ai: true,
      automations: true,
      campaigns: true,
      reports: true,
      api: true,
      webhooks: true,
      webhooksLimit: 20,
      apiKeysLimit: 10,
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
    maxChannels: 2,
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
      campaignsEnabled: true,
      advancedAutomationEnabled: true,
      advancedReportsEnabled: true,
      teamReportsEnabled: true,
      aiReportsEnabled: true,
      advancedPermissionsEnabled: true,
      prioritySupportEnabled: true,
      listFromPriceMonthly: 1490,
      crm: true,
      inbox: true,
      ai: true,
      automations: true,
      campaigns: true,
      reports: true,
      api: true,
      webhooks: true,
      webhooksLimit: 50,
      apiKeysLimit: 25,
      whiteLabel: true,
    },
  },
];

/** Texto de catálogo para prompts de IA (sempre derivado deste arquivo / DB sync) */
export function formatCatalogForAiPrompt(
  plans: Array<{
    name: string;
    slug: string;
    priceMonthly: number;
    priceOnRequest?: boolean;
    isActive?: boolean;
    maxUsers?: number;
    maxChannels?: number;
    maxAiMessages?: number;
  }>
): string {
  const lines = plans
    .filter((p) => p.isActive !== false && p.slug !== "free")
    .map((p) => {
      const price = p.priceOnRequest
        ? "Sob consulta (preço personalizado por contrato)"
        : `R$ ${Number(p.priceMonthly).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}/mês`;
      return `• ${p.name} — ${price}`;
    });
  return lines.join("\n") || "Consulte o painel NexaFlow para planos atualizados.";
}
