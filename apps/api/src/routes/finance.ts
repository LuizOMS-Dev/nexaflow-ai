import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { audit } from "../services/audit";

const CATEGORY_LABEL: Record<string, string> = {
  SUBSCRIPTION: "Assinatura / Recorrência",
  SERVICE: "Serviço / Prestação",
  PRODUCT: "Produto / Licença",
  ONE_TIME: "Cobrança Única / Avulsa",
  OTHER: "Outros",
};

const COST_CATEGORY_LABEL: Record<string, string> = {
  TEAM: "Equipe & Colaboradores",
  TOOLS: "Ferramentas & Softwares",
  ADS: "Anúncios & Marketing",
  INFRASTRUCTURE: "Infraestrutura & Servidores",
  SUPPORT: "Atendimento & Suporte",
  OTHER: "Outros Custos Fixos",
};

export async function financeRoutes(app: FastifyInstance) {
  // Toda rota deste módulo exige tenantId na sessão
  app.addHook("preHandler", app.requireSection("FINANCE"));

  /**
   * Resumo executivo financeiro da empresa (Tenant)
   */
  app.get("/finance/overview", async (request) => {
    const tenantId = request.user.tenantId!;
    const q = z
      .object({
        days: z.coerce.number().int().min(1).max(365).optional().default(30),
      })
      .parse(request.query || {});

    const days = q.days || 30;
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Consultas paralelas isoladas pelo tenantId
    const [charges, costs, wonOpportunities, recentAuditLogs] = await Promise.all([
      prisma.tenantCharge.findMany({
        where: { tenantId },
        include: {
          contact: { select: { id: true, name: true, phone: true, email: true, company: true } },
          opportunity: { select: { id: true, title: true } },
        },
        orderBy: { dueAt: "desc" },
      }),
      prisma.tenantCost.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.opportunity.findMany({
        where: { tenantId, status: "WON", updatedAt: { gte: since } },
        select: { id: true, title: true, value: true, updatedAt: true },
      }),
      prisma.auditLog.findMany({
        where: {
          tenantId,
          action: { startsWith: "finance." },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    // 1. Cálculo de MRR da Empresa (Receita Recorrente Mensal Contratada)
    // Considera cobranças ativas (PENDING ou PAID) com recorrência configurada
    let mrr = 0;
    const activePayingContacts = new Set<string>();
    const revenueByCategoryMap = new Map<string, { label: string; amount: number; count: number }>();

    for (const c of charges) {
      const amt = Number(c.amount || 0);
      if (c.status === "CANCELLED" || amt <= 0) continue;

      let monthlyValue = 0;
      if (c.recurrence === "MONTHLY") {
        monthlyValue = amt;
      } else if (c.recurrence === "ANNUAL") {
        monthlyValue = amt / 12;
      } else if (c.recurrence === "QUARTERLY") {
        monthlyValue = amt / 3;
      }

      if (monthlyValue > 0 && (c.status === "PENDING" || c.status === "PAID" || c.status === "OVERDUE")) {
        mrr += monthlyValue;
        if (c.contactId) {
          activePayingContacts.add(c.contactId);
        }

        const cat = c.category || "OTHER";
        const cur = revenueByCategoryMap.get(cat) || {
          label: CATEGORY_LABEL[cat] || cat,
          amount: 0,
          count: 0,
        };
        cur.amount += monthlyValue;
        cur.count += 1;
        revenueByCategoryMap.set(cat, cur);
      }
    }

    const arr = mrr * 12;
    const payingClientsCount = activePayingContacts.size;
    const avgTicket = payingClientsCount > 0 ? mrr / payingClientsCount : 0;

    // 2. Receita do Período (Faturado / Recebido efetivamente no período)
    const paidInPeriodCharges = charges.filter(
      (c) => c.status === "PAID" && c.paidAt && new Date(c.paidAt) >= since
    );
    const periodRevenueFromCharges = paidInPeriodCharges.reduce(
      (acc, c) => acc + Number(c.amount || 0),
      0
    );
    const periodRevenueFromDeals = wonOpportunities.reduce(
      (acc, o) => acc + Number(o.value || 0),
      0
    );
    // Se há cobranças pagas, usa a soma delas; senão usa os ganhos do funil CRM
    const periodRevenue =
      periodRevenueFromCharges > 0 ? periodRevenueFromCharges : periodRevenueFromDeals;

    // 3. Custos Operacionais Mensais
    const activeCosts = costs.filter((c) => c.isActive);
    let monthlyCosts = 0;
    for (const c of activeCosts) {
      const amt = Number(c.amount || 0);
      if (c.recurrence === "MONTHLY") {
        monthlyCosts += amt;
      } else if (c.recurrence === "ANNUAL") {
        monthlyCosts += amt / 12;
      } else if (c.recurrence === "ONE_TIME") {
        // Custo avulso não entra na média mensal fixa
      }
    }

    const costsConfigured = costs.length > 0;
    const estimatedProfit = mrr - monthlyCosts;
    const estimatedMargin = mrr > 0 ? (estimatedProfit / mrr) * 100 : 0;

    // 4. Distribuição por Categoria
    const revenueByCategory = Array.from(revenueByCategoryMap.entries()).map(([key, data]) => ({
      category: key,
      label: data.label,
      amount: data.amount,
      count: data.count,
      sharePercentage: mrr > 0 ? Math.round((data.amount / mrr) * 100) : 0,
    }));
    revenueByCategory.sort((a, b) => b.amount - a.amount);

    // 5. Vencimentos & Inadimplência
    const upcomingCharges = charges
      .filter((c) => c.status === "PENDING" && new Date(c.dueAt) >= now)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 5);

    const overdueCharges = charges.filter((c) => {
      if (c.status === "CANCELLED" || c.status === "PAID") return false;
      return c.status === "OVERDUE" || (c.status === "PENDING" && new Date(c.dueAt) < now);
    });

    const overdueTotalAmount = overdueCharges.reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const overdueClientsCount = new Set(overdueCharges.map((c) => c.contactId).filter(Boolean)).size;

    // 6. Evolução Histórica (Agrupamento mensal real)
    const monthlyHistoryMap = new Map<string, number>();
    for (const c of charges) {
      if (c.status === "PAID" && c.paidAt) {
        const d = new Date(c.paidAt);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyHistoryMap.set(k, (monthlyHistoryMap.get(k) || 0) + Number(c.amount || 0));
      }
    }
    const historyEntries = Array.from(monthlyHistoryMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, value]) => ({ month, value }));

    const hasEnoughHistory = historyEntries.length >= 2;

    // 7. Atividade Recente
    const recentActivity = recentAuditLogs.map((log) => {
      let description = log.action;
      if (log.action === "finance.charge.create") {
        description = `Nova cobrança criada (${log.entityId || ""})`;
      } else if (log.action === "finance.charge.paid") {
        description = `Cobrança marcada como paga`;
      } else if (log.action === "finance.cost.create") {
        description = `Novo custo operacional cadastrado`;
      } else if (log.action === "finance.cost.update") {
        description = `Custo operacional atualizado`;
      }
      return {
        id: log.id,
        action: log.action,
        description,
        userName: log.user?.name || log.user?.email || "Usuário",
        createdAt: log.createdAt,
      };
    });

    return {
      periodDays: days,
      stats: {
        mrr,
        arr,
        periodRevenue,
        avgTicket,
        payingClientsCount,
        activeChargesCount: charges.filter((c) => c.status !== "CANCELLED").length,
        pendingChargesCount: charges.filter((c) => c.status === "PENDING").length,
        paidChargesCount: charges.filter((c) => c.status === "PAID").length,
      },
      performance: {
        mrr,
        monthlyCosts,
        estimatedProfit,
        estimatedMargin,
        costsConfigured,
      },
      revenueByCategory,
      upcomingCharges: upcomingCharges.map((c) => ({
        id: c.id,
        title: c.title,
        amount: Number(c.amount),
        dueAt: c.dueAt,
        status: c.status,
        category: c.category,
        categoryLabel: CATEGORY_LABEL[c.category] || c.category,
        contactName: c.contact?.name || "Sem contato",
      })),
      overdueSummary: {
        count: overdueCharges.length,
        totalAmount: overdueTotalAmount,
        clientsCount: overdueClientsCount,
        items: overdueCharges.slice(0, 5).map((c) => ({
          id: c.id,
          title: c.title,
          amount: Number(c.amount),
          dueAt: c.dueAt,
          status: "OVERDUE",
          contactName: c.contact?.name || "Sem contato",
        })),
      },
      history: {
        hasEnoughHistory,
        entries: historyEntries,
      },
      recentActivity,
      costsCount: costs.length,
    };
  });

  /**
   * Listagem paginada de cobranças da empresa
   */
  app.get("/finance/charges", async (request) => {
    const tenantId = request.user.tenantId!;
    const q = z
      .object({
        search: z.string().optional(),
        status: z.enum(["ALL", "PENDING", "PAID", "OVERDUE", "CANCELLED"]).optional(),
        category: z.string().optional(),
        contactId: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query || {});

    const where: Record<string, unknown> = { tenantId };
    if (q.status && q.status !== "ALL") {
      where.status = q.status;
    }
    if (q.category) {
      where.category = q.category;
    }
    if (q.contactId) {
      where.contactId = q.contactId;
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { title: { contains: s, mode: "insensitive" } },
        { contact: { name: { contains: s, mode: "insensitive" } } },
        { notes: { contains: s, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.tenantCharge.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, phone: true, email: true, company: true } },
          opportunity: { select: { id: true, title: true } },
        },
        orderBy: { dueAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.tenantCharge.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        categoryLabel: CATEGORY_LABEL[c.category] || c.category,
        amount: Number(c.amount),
        recurrence: c.recurrence,
        status: c.status,
        dueAt: c.dueAt,
        paidAt: c.paidAt,
        notes: c.notes,
        contact: c.contact,
        opportunity: c.opportunity,
        createdAt: c.createdAt,
      })),
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    };
  });

  /**
   * Criação de nova cobrança
   */
  app.post("/finance/charges", async (request) => {
    const tenantId = request.user.tenantId!;
    const body = z
      .object({
        title: z.string().min(2, "Título é obrigatório"),
        contactId: z.string().optional().nullable(),
        opportunityId: z.string().optional().nullable(),
        category: z.enum(["SUBSCRIPTION", "SERVICE", "PRODUCT", "ONE_TIME", "OTHER"]).default("SUBSCRIPTION"),
        amount: z.number().positive("O valor deve ser maior que zero"),
        recurrence: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME", "QUARTERLY"]).default("MONTHLY"),
        dueAt: z.string().datetime(),
        notes: z.string().optional().nullable(),
      })
      .parse(request.body);

    const charge = await prisma.tenantCharge.create({
      data: {
        tenantId,
        title: body.title,
        contactId: body.contactId || null,
        opportunityId: body.opportunityId || null,
        category: body.category,
        amount: body.amount,
        recurrence: body.recurrence,
        status: "PENDING",
        dueAt: new Date(body.dueAt),
        notes: body.notes || null,
      },
      include: {
        contact: { select: { id: true, name: true } },
      },
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: "finance.charge.create",
      entity: "TenantCharge",
      entityId: charge.id,
      metadata: { title: charge.title, amount: body.amount },
    });

    return {
      ...charge,
      amount: Number(charge.amount),
    };
  });

  /**
   * Atualização de cobrança (ex: marcar como paga, editar valor)
   */
  app.patch("/finance/charges/:id", async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = request.params as { id: string };

    const body = z
      .object({
        title: z.string().min(2).optional(),
        category: z.enum(["SUBSCRIPTION", "SERVICE", "PRODUCT", "ONE_TIME", "OTHER"]).optional(),
        amount: z.number().positive().optional(),
        recurrence: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME", "QUARTERLY"]).optional(),
        status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELLED"]).optional(),
        dueAt: z.string().datetime().optional(),
        paidAt: z.string().datetime().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(request.body);

    // Validação estrita de IDOR
    const existing = assertFound(
      await prisma.tenantCharge.findFirst({
        where: { id, tenantId },
      })
    );

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.recurrence !== undefined) updateData.recurrence = body.recurrence;
    if (body.dueAt !== undefined) updateData.dueAt = new Date(body.dueAt);
    if (body.notes !== undefined) updateData.notes = body.notes;

    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === "PAID" && !existing.paidAt && !body.paidAt) {
        updateData.paidAt = new Date();
      } else if (body.status !== "PAID" && body.paidAt === null) {
        updateData.paidAt = null;
      }
    }
    if (body.paidAt !== undefined) {
      updateData.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    }

    const updated = await prisma.tenantCharge.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        contact: { select: { id: true, name: true } },
      },
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: body.status === "PAID" ? "finance.charge.paid" : "finance.charge.update",
      entity: "TenantCharge",
      entityId: updated.id,
      metadata: { status: updated.status, amount: Number(updated.amount) },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  });

  /**
   * Exclusão de cobrança
   */
  app.delete("/finance/charges/:id", async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = request.params as { id: string };

    const existing = assertFound(
      await prisma.tenantCharge.findFirst({
        where: { id, tenantId },
      })
    );

    await prisma.tenantCharge.delete({
      where: { id: existing.id },
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: "finance.charge.delete",
      entity: "TenantCharge",
      entityId: existing.id,
    });

    return { ok: true };
  });

  /**
   * Listagem de custos operacionais da empresa
   */
  app.get("/finance/costs", async (request) => {
    const tenantId = request.user.tenantId!;
    const costs = await prisma.tenantCost.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return costs.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      categoryLabel: COST_CATEGORY_LABEL[c.category] || c.category,
      amount: Number(c.amount),
      recurrence: c.recurrence,
      isActive: c.isActive,
      notes: c.notes,
      createdAt: c.createdAt,
    }));
  });

  /**
   * Cadastro de custo operacional
   */
  app.post("/finance/costs", async (request) => {
    const tenantId = request.user.tenantId!;
    const body = z
      .object({
        name: z.string().min(2, "Nome é obrigatório"),
        category: z.enum(["TEAM", "TOOLS", "ADS", "INFRASTRUCTURE", "SUPPORT", "OTHER"]).default("TOOLS"),
        amount: z.number().positive("O valor deve ser maior que zero"),
        recurrence: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME"]).default("MONTHLY"),
        notes: z.string().optional().nullable(),
      })
      .parse(request.body);

    const cost = await prisma.tenantCost.create({
      data: {
        tenantId,
        name: body.name,
        category: body.category,
        amount: body.amount,
        recurrence: body.recurrence,
        isActive: true,
        notes: body.notes || null,
      },
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: "finance.cost.create",
      entity: "TenantCost",
      entityId: cost.id,
      metadata: { name: cost.name, amount: body.amount },
    });

    return {
      ...cost,
      amount: Number(cost.amount),
      categoryLabel: COST_CATEGORY_LABEL[cost.category] || cost.category,
    };
  });

  /**
   * Atualização de custo operacional
   */
  app.patch("/finance/costs/:id", async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = request.params as { id: string };

    const body = z
      .object({
        name: z.string().min(2).optional(),
        category: z.enum(["TEAM", "TOOLS", "ADS", "INFRASTRUCTURE", "SUPPORT", "OTHER"]).optional(),
        amount: z.number().positive().optional(),
        recurrence: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME"]).optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional().nullable(),
      })
      .parse(request.body);

    const existing = assertFound(
      await prisma.tenantCost.findFirst({
        where: { id, tenantId },
      })
    );

    const updated = await prisma.tenantCost.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        category: body.category ?? existing.category,
        amount: body.amount !== undefined ? body.amount : existing.amount,
        recurrence: body.recurrence ?? existing.recurrence,
        isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      },
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: "finance.cost.update",
      entity: "TenantCost",
      entityId: updated.id,
    });

    return {
      ...updated,
      amount: Number(updated.amount),
      categoryLabel: COST_CATEGORY_LABEL[updated.category] || updated.category,
    };
  });

  /**
   * Exclusão de custo operacional
   */
  app.delete("/finance/costs/:id", async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = request.params as { id: string };

    const existing = assertFound(
      await prisma.tenantCost.findFirst({
        where: { id, tenantId },
      })
    );

    await prisma.tenantCost.delete({
      where: { id: existing.id },
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: "finance.cost.delete",
      entity: "TenantCost",
      entityId: existing.id,
    });

    return { ok: true };
  });
}
