/**
 * Exclusão real de empresa (Tenant).
 * - now: transação, dados do tenant + Users exclusivos desta empresa
 * - User com membership em outra empresa ou SUPERADMIN é preservado
 * - schedule: scheduledDeletionAt + PENDING_DELETION, opera até a data
 * - job persistente lê o banco (nunca setTimeout por tenant)
 */
import type { Prisma, TenantStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { recordSecurityEvent } from "../security/security-event";
import { toCivilDateUtc } from "../billing";
import { tenantSettings } from "./fixtures";

export type DeletionMode = "now" | "schedule";

export type ScheduleEligibility = {
  canSchedule: boolean;
  at: Date | null;
  civilDate: string | null;
  reason: string | null;
};

const inflight = new Map<string, Promise<unknown>>();

function namesMatch(confirm: string, name: string) {
  return confirm.trim() === name.trim();
}

export function resolveScheduleEligibility(params: {
  hasCharge: boolean;
  currentPeriodEnd: Date | string | null | undefined;
  now?: Date;
}): ScheduleEligibility {
  const now = params.now ?? new Date();
  if (!params.hasCharge) {
    return {
      canSchedule: false,
      at: null,
      civilDate: null,
      reason: "Não há vencimento: plano sem cobrança (gratuito, zero ou sob consulta).",
    };
  }
  if (!params.currentPeriodEnd) {
    return {
      canSchedule: false,
      at: null,
      civilDate: null,
      reason: "Não há próximo vencimento cadastrado na assinatura.",
    };
  }
  const at = params.currentPeriodEnd instanceof Date
    ? params.currentPeriodEnd
    : new Date(params.currentPeriodEnd);
  if (Number.isNaN(at.getTime())) {
    return {
      canSchedule: false,
      at: null,
      civilDate: null,
      reason: "A data de vencimento da assinatura é inválida.",
    };
  }
  if (at.getTime() <= now.getTime()) {
    return {
      canSchedule: false,
      at,
      civilDate: toCivilDateUtc(at),
      reason: "O vencimento atual já passou. Atualize a cobrança ou exclua agora.",
    };
  }
  return {
    canSchedule: true,
    at,
    civilDate: toCivilDateUtc(at),
    reason: null,
  };
}

async function loadEligibility(tenantId: string, now?: Date): Promise<ScheduleEligibility> {
  const tenant = assertFound(
    await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: true,
      },
    })
  );
  const price = tenant.subscription?.priceMonthly != null ? Number(tenant.subscription.priceMonthly) : 0;
  return resolveScheduleEligibility({
    hasCharge: Number.isFinite(price) && price > 0,
    currentPeriodEnd: tenant.subscription?.currentPeriodEnd,
    now,
  });
}

/** Tabelas com tenantId sem FK Cascade para Tenant. */
async function deleteOrphanTenantRows(tx: Prisma.TransactionClient, tenantId: string) {
  const byTenant = { tenantId };
  await tx.webhookDelivery.deleteMany({ where: byTenant });
  await tx.apiUsageLog.deleteMany({ where: byTenant });
  await tx.contactScoreHistory.deleteMany({ where: byTenant });
  await tx.recommendationDecision.deleteMany({ where: byTenant });
  await tx.note.deleteMany({ where: byTenant });
  await tx.agentKnowledge.deleteMany({ where: byTenant });
  await tx.helpAssistantThread.deleteMany({ where: byTenant });
  await tx.helpKnowledgeGap.deleteMany({ where: byTenant });
  await tx.notification.deleteMany({ where: byTenant });
  await tx.userInvite.deleteMany({ where: byTenant });
  await tx.aiUsageLog.deleteMany({ where: byTenant });
  await tx.authSession.deleteMany({ where: byTenant });
  await tx.mfaChallenge.deleteMany({ where: byTenant });
  await tx.payment.deleteMany({ where: byTenant });
  await tx.subscription.deleteMany({ where: byTenant });
}

async function collectSideEffects(tenantId: string) {
  const [docs, channels] = await Promise.all([
    prisma.knowledgeDoc.findMany({
      where: { tenantId, storagePath: { not: null } },
      select: { storagePath: true },
    }),
    prisma.channel.findMany({
      where: { tenantId, type: "WHATSAPP" },
      select: { config: true },
    }),
  ]);
  const instanceNames: string[] = [];
  for (const ch of channels) {
    const cfg = (ch.config || {}) as Record<string, unknown>;
    const name = String(cfg.instanceName || cfg.session || "").trim();
    if (name && !name.includes("..") && !name.includes("/") && !name.includes("\\")) {
      instanceNames.push(name);
    }
  }
  return {
    storagePaths: docs.map((d) => d.storagePath).filter(Boolean) as string[],
    instanceNames,
  };
}

/**
 * Após o Tenant (e as memberships dele) saírem: apaga User que ficou sem
 * nenhuma outra empresa. SUPERADMIN e o ator da exclusão nunca entram.
 */
async function deleteExclusiveCompanyUsers(
  tx: Prisma.TransactionClient,
  memberUserIds: string[],
  actorSub: string
): Promise<{ deletedUserIds: string[]; preservedUserIds: string[] }> {
  const unique = [...new Set(memberUserIds.filter(Boolean))];
  if (!unique.length) return { deletedUserIds: [], preservedUserIds: [] };

  const users = await tx.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      platformRole: true,
      memberships: { select: { id: true, isActive: true } },
    },
  });

  const deletedUserIds: string[] = [];
  const preservedUserIds: string[] = [];
  for (const u of users) {
    const hasActiveMemberships = u.memberships.some((m) => m.isActive);
    const keep =
      u.id === actorSub ||
      u.platformRole === "SUPERADMIN" ||
      hasActiveMemberships;
    if (keep) preservedUserIds.push(u.id);
    else deletedUserIds.push(u.id);
  }
  if (!deletedUserIds.length) return { deletedUserIds, preservedUserIds };

  await tx.membership.deleteMany({ where: { userId: { in: deletedUserIds } } });
  await tx.note.deleteMany({ where: { authorId: { in: deletedUserIds } } });
  await tx.message.updateMany({
    where: { authorId: { in: deletedUserIds } },
    data: { authorId: null },
  });
  await tx.conversation.updateMany({
    where: { assignedToId: { in: deletedUserIds } },
    data: { assignedToId: null },
  });
  await tx.task.updateMany({
    where: { assigneeId: { in: deletedUserIds } },
    data: { assigneeId: null },
  });
  await tx.task.updateMany({
    where: { creatorId: { in: deletedUserIds } },
    data: { creatorId: null },
  });
  await tx.notification.deleteMany({ where: { userId: { in: deletedUserIds } } });
  await tx.helpAssistantThread.deleteMany({ where: { userId: { in: deletedUserIds } } });
  await tx.contact.updateMany({
    where: { responsibleUserId: { in: deletedUserIds } },
    data: { responsibleUserId: null },
  });
  await tx.user.deleteMany({ where: { id: { in: deletedUserIds } } });

  return { deletedUserIds, preservedUserIds };
}

/** Conta sem membership ativo (empresa já apagada): libera o e-mail para novo cadastro. */
export async function recycleOrphanCompanyUser(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.membership.deleteMany({ where: { userId } });
    await deleteExclusiveCompanyUsers(tx, [userId], "system");
  });
}

/** Varre e remove todos os usuários sem empresas associadas (exceto SUPERADMIN). */
export async function purgeAllOrphanUsers(tx?: Prisma.TransactionClient) {
  const client = tx || prisma;
  const orphans = await client.user.findMany({
    where: {
      platformRole: null,
      OR: [
        { memberships: { none: {} } },
        { memberships: { every: { isActive: false } } },
      ],
    },
    select: { id: true, email: true },
  });

  if (!orphans.length) return { count: 0, ids: [] };

  const orphanIds = orphans.map((o) => o.id);

  await client.membership.deleteMany({ where: { userId: { in: orphanIds } } });
  await client.note.deleteMany({ where: { authorId: { in: orphanIds } } });
  await client.message.updateMany({
    where: { authorId: { in: orphanIds } },
    data: { authorId: null },
  });
  await client.conversation.updateMany({
    where: { assignedToId: { in: orphanIds } },
    data: { assignedToId: null },
  });
  await client.task.updateMany({
    where: { assigneeId: { in: orphanIds } },
    data: { assigneeId: null },
  });
  await client.task.updateMany({
    where: { creatorId: { in: orphanIds } },
    data: { creatorId: null },
  });
  await client.notification.deleteMany({ where: { userId: { in: orphanIds } } });
  await client.helpAssistantThread.deleteMany({ where: { userId: { in: orphanIds } } });
  await client.contact.updateMany({
    where: { responsibleUserId: { in: orphanIds } },
    data: { responsibleUserId: null },
  });
  await client.user.deleteMany({ where: { id: { in: orphanIds } } });

  return { count: orphanIds.length, ids: orphanIds };
}

async function cleanupSideEffects(side: {
  storagePaths: string[];
  instanceNames: string[];
}) {
  if (side.instanceNames.length) {
    try {
      const { createMultiFileAuthStore } = await import("../whatsapp/auth-store");
      for (const name of side.instanceNames) {
        try {
          const store = createMultiFileAuthStore(name);
          store.wipe();
        } catch {
          /* best-effort */
        }
      }
    } catch {
      /* auth-store opcional */
    }
  }
  if (side.storagePaths.length) {
    try {
      const { unlink } = await import("fs/promises");
      const path = await import("path");
      const { env } = await import("../../lib/env");
      const root = path.resolve(env.storagePath);
      for (const rel of side.storagePaths) {
        const abs = path.resolve(root, rel);
        if (!abs.startsWith(root)) continue;
        await unlink(abs).catch(() => null);
      }
    } catch {
      /* best-effort */
    }
  }
}

export async function purgeTenantData(
  tenantId: string,
  actor: { sub: string; ip?: string },
  meta: { mode: DeletionMode; reason?: string | null; source: "admin" | "scheduled_job" }
): Promise<{
  ok: true;
  alreadyDeleted?: boolean;
  tenantId: string;
  name: string;
  deletedUserIds: string[];
  preservedUserIds: string[];
}> {
  const existing = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!existing) {
    return {
      ok: true,
      alreadyDeleted: true,
      tenantId,
      name: "",
      deletedUserIds: [],
      preservedUserIds: [],
    };
  }

  const side = await collectSideEffects(tenantId);
  const memberUserIds = (
    await prisma.membership.findMany({
      where: { tenantId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  let deletedUserIds: string[] = [];
  let preservedUserIds: string[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        const live = await tx.tenant.findUnique({ where: { id: tenantId } });
        if (!live) return;

        await tx.auditLog.create({
          data: {
            userId: actor.sub === "system" ? null : actor.sub,
            tenantId,
            action: "company.deleted",
            entity: "tenant",
            entityId: tenantId,
            metadata: {
              name: live.name,
              slug: live.slug,
              mode: meta.mode,
              source: meta.source,
              reason: meta.reason || null,
              previousStatus: live.status,
              memberUserIds,
              hardDelete: true,
              deleteExclusiveUsers: true,
            } as Prisma.InputJsonValue,
            ip: actor.ip || null,
          },
        });

        await deleteOrphanTenantRows(tx, tenantId);
        await tx.tenant.delete({ where: { id: tenantId } });
        const users = await deleteExclusiveCompanyUsers(tx, memberUserIds, actor.sub);
        deletedUserIds = users.deletedUserIds;
        preservedUserIds = users.preservedUserIds;
      },
      { timeout: 30_000 }
    );
  } catch (err: unknown) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code) : "";
    if (code === "P2025") {
      return {
        ok: true,
        alreadyDeleted: true,
        tenantId,
        name: existing.name,
        deletedUserIds: [],
        preservedUserIds: [],
      };
    }
    throw err;
  }

  await cleanupSideEffects(side).catch(() => null);

  await recordSecurityEvent({
    type: "TENANT_DELETED",
    userId: actor.sub === "system" ? undefined : actor.sub,
    tenantId: null,
    ip: actor.ip,
    metadata: {
      tenantId,
      name: existing.name,
      mode: meta.mode,
      source: meta.source,
    },
  }).catch(() => null);

  return {
    ok: true,
    tenantId,
    name: existing.name,
    deletedUserIds,
    preservedUserIds,
  };
}

async function withInflight<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const pending = inflight.get(tenantId);
  if (pending) {
    throw new AppError("Exclusão já em andamento para esta empresa.", 409, "DELETION_IN_PROGRESS");
  }
  const run = fn();
  inflight.set(tenantId, run);
  try {
    return await run;
  } finally {
    inflight.delete(tenantId);
  }
}

export async function deleteCompanyNow(
  id: string,
  body: { confirmName: string; acknowledged: boolean; reason?: string },
  actor: { sub: string; ip?: string }
) {
  if (!body.acknowledged) {
    throw new AppError("Confirme que entende que a exclusão é definitiva.", 400, "ACK_REQUIRED");
  }
  const tenant = assertFound(await prisma.tenant.findUnique({ where: { id } }));
  if (!namesMatch(body.confirmName, tenant.name)) {
    throw new AppError(
      "Digite o nome exato da empresa para confirmar a exclusão.",
      400,
      "CONFIRM_NAME_MISMATCH"
    );
  }

  const result = await withInflight(id, () =>
    purgeTenantData(id, actor, {
      mode: "now",
      reason: body.reason || null,
      source: "admin",
    })
  );

  const deletedCount = result.deletedUserIds.length;
  return {
    ok: true,
    deleted: true,
    alreadyDeleted: Boolean(result.alreadyDeleted),
    tenantId: id,
    name: result.name || tenant.name,
    deletedUserCount: deletedCount,
    deletedUserIds: result.deletedUserIds,
    preservedUserIds: result.preservedUserIds,
    message:
      deletedCount > 0
        ? `Empresa excluída. ${deletedCount} usuário(s) exclusivo(s) desta empresa também foram removidos.`
        : "Empresa excluída definitivamente.",
  };
}

export async function scheduleCompanyDeletion(
  id: string,
  body: { confirmName: string; acknowledged: boolean; reason?: string },
  actor: { sub: string; ip?: string }
) {
  if (!body.acknowledged) {
    throw new AppError("Confirme que entende que a exclusão é definitiva.", 400, "ACK_REQUIRED");
  }
  const tenant = assertFound(await prisma.tenant.findUnique({ where: { id } }));
  if (!namesMatch(body.confirmName, tenant.name)) {
    throw new AppError(
      "Digite o nome exato da empresa para confirmar a exclusão.",
      400,
      "CONFIRM_NAME_MISMATCH"
    );
  }
  if (tenant.status === "PENDING_DELETION" && tenant.scheduledDeletionAt) {
    throw new AppError("Esta empresa já possui exclusão agendada.", 409, "DELETION_ALREADY_SCHEDULED");
  }

  const eligibility = await loadEligibility(id);
  if (!eligibility.canSchedule || !eligibility.at) {
    throw new AppError(
      eligibility.reason || "Não há próximo vencimento válido para agendar.",
      400,
      "NO_VALID_DUE_DATE"
    );
  }

  const prev = tenantSettings(tenant.settings);
  const previousStatus: TenantStatus =
    tenant.status === "PENDING_DELETION"
      ? tenant.deletionPreviousStatus || "ACTIVE"
      : tenant.status;

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      status: "PENDING_DELETION",
      scheduledDeletionAt: eligibility.at,
      deletionPreviousStatus: previousStatus,
      settings: {
        ...prev,
        deletionRequestedAt: new Date().toISOString(),
        deletionRequestedBy: actor.sub,
        deletionReason: body.reason || null,
        deletionMode: "schedule",
      } as Prisma.InputJsonValue,
    },
  });

  await audit({
    userId: actor.sub,
    tenantId: id,
    action: "company.deletion_scheduled",
    entity: "tenant",
    entityId: id,
    metadata: {
      reason: body.reason || null,
      scheduledDeletionAt: eligibility.at.toISOString(),
      civilDate: eligibility.civilDate,
      previousStatus,
    },
    ip: actor.ip,
  });

  await recordSecurityEvent({
    type: "TENANT_DELETION_SCHEDULED",
    userId: actor.sub,
    tenantId: id,
    ip: actor.ip,
    metadata: {
      name: tenant.name,
      scheduledDeletionAt: eligibility.at.toISOString(),
    },
  });

  return {
    ok: true,
    deleted: false,
    scheduled: true,
    scheduledDeletionAt: updated.scheduledDeletionAt,
    civilDate: eligibility.civilDate,
    tenant: updated,
    message: `Exclusão agendada para ${eligibility.civilDate?.split("-").reverse().join("/")}.`,
  };
}

export async function cancelScheduledCompanyDeletion(
  id: string,
  actor: { sub: string; ip?: string }
) {
  const tenant = assertFound(await prisma.tenant.findUnique({ where: { id } }));
  if (tenant.status !== "PENDING_DELETION" && !tenant.scheduledDeletionAt) {
    throw new AppError("Não há exclusão agendada para cancelar.", 409, "NO_SCHEDULED_DELETION");
  }

  const restore = tenant.deletionPreviousStatus || "ACTIVE";
  const prev = tenantSettings(tenant.settings);
  delete prev.deletionRequestedAt;
  delete prev.deletionRequestedBy;
  delete prev.deletionReason;
  delete prev.deletionMode;

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      status: restore,
      scheduledDeletionAt: null,
      deletionPreviousStatus: null,
      settings: prev as Prisma.InputJsonValue,
    },
  });

  await audit({
    userId: actor.sub,
    tenantId: id,
    action: "company.deletion_cancelled",
    entity: "tenant",
    entityId: id,
    metadata: { restoredStatus: restore },
    ip: actor.ip,
  });

  return { ok: true, cancelled: true, tenant: updated, restoredStatus: restore };
}

export async function executeCompanyDeletion(
  id: string,
  body: {
    confirmName: string;
    acknowledged?: boolean;
    mode?: DeletionMode;
    reason?: string;
  },
  actor: { sub: string; ip?: string }
) {
  const mode: DeletionMode = body.mode === "schedule" ? "schedule" : "now";
  const acknowledged = Boolean(body.acknowledged);
  if (mode === "schedule") {
    return scheduleCompanyDeletion(id, { ...body, acknowledged }, actor);
  }
  return deleteCompanyNow(id, { ...body, acknowledged }, actor);
}

/** Worker: exclusões cujo vencimento já chegou. Idempotente e com retry no próximo tick. */
export async function runScheduledTenantDeletions(now = new Date()) {
  const due = await prisma.tenant.findMany({
    where: {
      status: "PENDING_DELETION",
      scheduledDeletionAt: { lte: now },
    },
    select: { id: true, name: true, scheduledDeletionAt: true },
    take: 25,
    orderBy: { scheduledDeletionAt: "asc" },
  });

  const results: Array<{ id: string; ok: boolean; alreadyDeleted?: boolean; error?: string }> = [];
  for (const row of due) {
    try {
      const out = await withInflight(row.id, () =>
        purgeTenantData(row.id, { sub: "system" }, { mode: "schedule", source: "scheduled_job" })
      );
      results.push({ id: row.id, ok: true, alreadyDeleted: out.alreadyDeleted });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof AppError && err.code === "DELETION_IN_PROGRESS") {
        results.push({ id: row.id, ok: false, error: err.code });
        continue;
      }
      console.warn(`[tenant-deletion] job failed tenant=${row.id}:`, message);
      results.push({ id: row.id, ok: false, error: message });
    }
  }
  return { scanned: due.length, results };
}

let deletionTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduledDeletionScheduler(opts?: {
  intervalMs?: number;
  log?: (msg: string) => void;
}) {
  const intervalMs = opts?.intervalMs ?? 60_000;
  const log = opts?.log ?? console.info;
  if (deletionTimer) return;

  const tick = () => {
    void runScheduledTenantDeletions()
      .then((r) => {
        const ok = r.results.filter((x) => x.ok).length;
        if (r.scanned) {
          log(`[tenant-deletion] scanned=${r.scanned} deleted=${ok}`);
        }
      })
      .catch((err) => {
        console.warn(
          "[tenant-deletion] scheduler failed:",
          err instanceof Error ? err.message : err
        );
      });
  };

  deletionTimer = setInterval(tick, intervalMs);
  if (typeof deletionTimer.unref === "function") deletionTimer.unref();
  tick();
}

export function stopScheduledDeletionScheduler() {
  if (deletionTimer) {
    clearInterval(deletionTimer);
    deletionTimer = null;
  }
}
