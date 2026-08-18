import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { advancePeriodAfterPayment, computeNextDueDate } from "../billing";
import { enrichTenantBilling, type SubscriptionRow } from "./billing-view";

export async function getTenantBillingDetail(tenantId: string) {
  const tenant = assertFound(
    await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
        companyProfile: true,
      },
    })
  );

  const [subscription, payments] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: { select: { id: true, name: true, priceMonthly: true, priceOnRequest: true } },
      },
    }),
    prisma.payment.findMany({
      where: { tenantId },
      orderBy: { paidAt: "desc" },
      take: 100,
    }),
  ]);

  const billing = enrichTenantBilling(tenant, subscription as SubscriptionRow | null);

  return {
    tenantId,
    tenantName: tenant.name,
    tenantStatus: tenant.status,
    plan: tenant.plan,
    billing,
    subscription: subscription
      ? {
          id: subscription.id,
          billingStatus: subscription.billingStatus,
          billingCycle: subscription.billingCycle,
          priceMonthly: subscription.priceMonthly != null ? Number(subscription.priceMonthly) : null,
          priceAnnual: subscription.priceAnnual != null ? Number(subscription.priceAnnual) : null,
          billingDueDay: subscription.billingDueDay,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          cancelAt: subscription.cancelAt,
        }
      : null,
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt,
      referencePeriod: p.referencePeriod,
      method: p.method,
      notes: p.notes,
      idempotencyKey: p.idempotencyKey,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    })),
  };
}

export async function registerTenantPayment(
  tenantId: string,
  body: {
    amount: number;
    paidAt?: string;
    referencePeriod?: string | null;
    method?: "PIX" | "TRANSFER" | "BOLETO" | "CARD" | "CASH" | "OTHER" | null;
    notes?: string | null;
    idempotencyKey?: string | null;
    advanceDueDate?: boolean;
  },
  actor: { sub: string; ip?: string }
) {
  if (body.amount <= 0 || !Number.isFinite(body.amount)) {
    throw new AppError("O valor do pagamento deve ser um número positivo.", 400, "INVALID_PAYMENT_AMOUNT");
  }

  // Se veio idempotencyKey, verifica se já foi registrado
  if (body.idempotencyKey?.trim()) {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey: body.idempotencyKey.trim() },
    });
    if (existing) {
      throw new AppError(
        "Este pagamento já foi registrado anteriormente (chave de idempotência duplicada).",
        409,
        "DUPLICATE_PAYMENT_REQUEST"
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const tenant = assertFound(
      await tx.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
      })
    );

    let sub = await tx.subscription.findUnique({ where: { tenantId } });
    if (!sub && tenant.planId) {
      const { ensureTenantSubscription } = await import("../entitlements");
      sub = await ensureTenantSubscription({
        tenantId,
        planId: tenant.planId,
        billingStatus: "ACTIVE",
        updateContractedPrice: true,
      });
    }

    if (!sub) {
      throw new AppError(
        "Empresa sem assinatura. Atribua um plano antes de registrar pagamento.",
        400,
        "NO_SUBSCRIPTION"
      );
    }

    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

    let payment;
    try {
      payment = await tx.payment.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          amount: body.amount,
          paidAt,
          referencePeriod: body.referencePeriod || null,
          method: body.method || null,
          notes: body.notes || null,
          idempotencyKey: body.idempotencyKey?.trim() || null,
          createdBy: actor.sub,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new AppError(
          "Este pagamento já foi registrado anteriormente (chave de idempotência duplicada).",
          409,
          "DUPLICATE_PAYMENT_REQUEST"
        );
      }
      throw err;
    }

    let nextDue = sub.currentPeriodEnd;
    if (body.advanceDueDate !== false) {
      nextDue = advancePeriodAfterPayment({
        billingDueDay: sub.billingDueDay,
        currentPeriodEnd: sub.currentPeriodEnd,
        paidAt,
      });
    }

    const updatedSub = await tx.subscription.update({
      where: { id: sub.id },
      data: {
        billingStatus: "ACTIVE",
        currentPeriodEnd: nextDue,
        ...(sub.billingDueDay == null && nextDue ? { billingDueDay: nextDue.getUTCDate() } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.sub,
        tenantId,
        action: "company.payment_registered",
        entity: "payment",
        entityId: payment.id,
        metadata: {
          amount: body.amount,
          paidAt: paidAt.toISOString(),
          idempotencyKey: body.idempotencyKey?.trim() || null,
          referencePeriod: body.referencePeriod || null,
          method: body.method || null,
          nextDueAt: updatedSub.currentPeriodEnd?.toISOString() || null,
        },
        ip: actor.ip || null,
      },
    });

    return {
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        paidAt: payment.paidAt,
        referencePeriod: payment.referencePeriod,
        method: payment.method,
        notes: payment.notes,
        createdAt: payment.createdAt,
      },
      subscription: {
        id: updatedSub.id,
        billingStatus: updatedSub.billingStatus,
        billingDueDay: updatedSub.billingDueDay,
        currentPeriodEnd: updatedSub.currentPeriodEnd,
        priceMonthly: updatedSub.priceMonthly != null ? Number(updatedSub.priceMonthly) : null,
      },
      billing: enrichTenantBilling(tenant, updatedSub as SubscriptionRow),
    };
  });
}

export async function cancelTenantSubscription(
  tenantId: string,
  reason: string | undefined,
  actor: { sub: string; ip?: string }
) {
  assertFound(await prisma.tenant.findUnique({ where: { id: tenantId } }));

  const sub = assertFound(
    await prisma.subscription.findUnique({ where: { tenantId } })
  );

  const updatedSub = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      billingStatus: "CANCELLED",
      cancelAt: new Date(),
    },
  });

  await audit({
    userId: actor.sub,
    tenantId,
    action: "company.subscription_canceled",
    entity: "subscription",
    entityId: sub.id,
    metadata: { reason: reason || null },
    ip: actor.ip,
  });

  return updatedSub;
}
