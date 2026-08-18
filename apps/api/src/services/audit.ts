import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { redactMetadata } from "./platform-log-redaction";
import { AppError, assertFound } from "../lib/errors";

export type AuditCategory =
  | "AUTH"
  | "ADMIN"
  | "COMPANY"
  | "PLAN"
  | "FINANCE"
  | "DEPLOY"
  | "GITHUB"
  | "EASYPANEL"
  | "SECURITY"
  | "OTHER";

export type AuditSeverity = "SUCCESS" | "INFO" | "WARNING" | "FAIL" | "CRITICAL";

export interface AuditRecordParams {
  action: string;
  userId?: string | null;
  tenantId?: string | null;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export interface AuditListParams {
  take?: number;
  cursor?: string;
  search?: string;
  category?: string;
  severity?: string;
  tenantId?: string;
}

export class AuditService {
  /**
   * Normaliza o IP do cliente removendo prefixos IPv6 de localhost
   */
  static normalizeIp(ip?: string | null): string | null {
    if (!ip) return null;
    let clean = ip.trim();
    if (clean === "::1" || clean === "::ffff:127.0.0.1") return "127.0.0.1";
    if (clean.startsWith("::ffff:")) clean = clean.slice(7);
    return clean;
  }

  /**
   * Deriva a categoria funcional do evento a partir do eventCode
   */
  static deriveCategory(action: string): AuditCategory {
    const a = (action || "").toLowerCase();
    if (/^(auth\.|login\.|session\.|mfa\.|password\.)/.test(a)) return "AUTH";
    if (/^(deployment\.|deploy\.)/.test(a)) return "DEPLOY";
    if (/^(github\.|github_updates\.)/.test(a)) return "GITHUB";
    if (/^(easypanel\.)/.test(a)) return "EASYPANEL";
    if (/^(company\.|tenant\.|team\.)/.test(a)) return "COMPANY";
    if (/^(plan\.|subscription\.)/.test(a)) return "PLAN";
    if (/^(admin\.cost|finance\.|payment\.)/.test(a)) return "FINANCE";
    if (/^(security\.)/.test(a) || /blocked|suspended|threat/.test(a)) return "SECURITY";
    if (/^(admin\.|platform\.|impersonate\.|audit\.)/.test(a)) return "ADMIN";
    return "ADMIN";
  }

  /**
   * Deriva a severidade semântica do evento
   * Estados oficiais: Sucesso (SUCCESS), Informação (INFO), Atenção (WARNING), Falha (FAIL), Crítico (CRITICAL)
   */
  static deriveSeverity(action: string, metadata?: unknown): AuditSeverity {
    const a = (action || "").toLowerCase();

    // 1. Eventos Críticos (impacto severo na operação ou segurança)
    if (
      /threat|compromise|tamper|impersonation_start|sessions\.revoked_all/.test(a) ||
      (/user\.(blocked|suspended)/.test(a) && !/unblock|reactivat/.test(a)) ||
      (/company\.(blocked|suspended|deleted)/.test(a) && !/unblock|reactivat/.test(a))
    ) {
      return "CRITICAL";
    }

    // 2. Falhas (operações que falharam tecnicamente ou foram negadas)
    if (
      /failed|failure|rejected|denied|unhealthy|error|clear_failed|rollback_failed/.test(a)
    ) {
      return "FAIL";
    }

    // 3. Atenção (operações sensíveis de administração, rotações, limpezas, reversões)
    if (
      /cleared|clear_requested|rollback|rotated|archive|deletion_requested|mfa\.disabled|password\.changed|session\.revoked|access_policy_updated|due_date_changed|plan_changed|impersonat/.test(
        a
      )
    ) {
      return "WARNING";
    }

    // 4. Sucesso (operações concluídas com êxito e validações aprovadas)
    if (
      /completed|succeeded|verified|healthy|reactivated|unblocked|payment_registered|login$/.test(
        a
      ) ||
      (a === "easypanel.connection.tested" && (metadata as any)?.success === true) ||
      (a === "github.connection.tested" && (metadata as any)?.success === true)
    ) {
      return "SUCCESS";
    }

    // 5. Informação (padrão para ações normais de ciclo de vida)
    return "INFO";
  }

  /**
   * Grava um evento de auditoria com metadata sanitizada em repouso e deduplicação de rajadas (< 2s)
   */
  static async record(params: AuditRecordParams) {
    try {
      const action = params.action.trim();
      const sanitizedMeta = params.metadata
        ? (redactMetadata(params.metadata) as Record<string, unknown>)
        : {};

      const ip = this.normalizeIp(params.ip);

      // Deduplicação de eventos idênticos em rajada (< 2 segundos) para evitar registros duplicados de polling ou double-click
      const twoSecAgo = new Date(Date.now() - 2000);
      const recentIdentical = await prisma.auditLog.findFirst({
        where: {
          action,
          userId: params.userId || null,
          tenantId: params.tenantId || null,
          entity: params.entity?.trim() || null,
          entityId: params.entityId?.trim() || null,
          createdAt: { gte: twoSecAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      if (recentIdentical) {
        return recentIdentical;
      }

      return await prisma.auditLog.create({
        data: {
          tenantId: params.tenantId || null,
          userId: params.userId || null,
          action,
          entity: params.entity?.trim() || null,
          entityId: params.entityId?.trim() || null,
          metadata: asInputJson(sanitizedMeta),
          ip,
        },
      });
    } catch (e) {
      // Gravação de auditoria não deve quebrar a requisição do usuário, mas loga se necessário
      console.error("[AuditService] Falha ao registrar log de auditoria:", e);
      return null;
    }
  }

  /**
   * Lista logs de auditoria com filtros server-side e paginação por cursor
   */
  static async list(params: AuditListParams = {}) {
    const take = Math.min(200, Math.max(1, params.take || 50));
    const search = params.search?.trim();
    const category = params.category?.trim().toUpperCase();
    const severity = params.severity?.trim().toUpperCase();

    // Filtros dinâmicos por categoria
    const categoryFilter = this.buildCategoryFilter(category);

    const where: any = {
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      ...categoryFilter,
    };

    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { entity: { contains: search, mode: "insensitive" } },
        { ip: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { tenant: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1, // Busca 1 extra para determinar nextCursor de forma exata
      ...(params.cursor
        ? {
            skip: 1,
            cursor: { id: params.cursor },
          }
        : {}),
    });

    const hasMore = logs.length > take;
    const itemsRaw = hasMore ? logs.slice(0, take) : logs;
    const nextCursor = hasMore ? itemsRaw[itemsRaw.length - 1]?.id ?? null : null;

    // Enriquecimento e pós-filtro de severidade caso solicitado
    let enriched = itemsRaw.map((l) => {
      const meta = redactMetadata(l.metadata) as Record<string, unknown> | null;
      const cat = this.deriveCategory(l.action);
      const sev = this.deriveSeverity(l.action, meta);

      return {
        id: l.id,
        action: l.action,
        category: cat,
        severity: sev,
        entity: l.entity,
        entityId: l.entityId,
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
        metadata: meta,
        user: l.user,
        tenant: l.tenant,
      };
    });

    if (severity && severity !== "ALL") {
      enriched = enriched.filter((item) => item.severity === severity);
    }

    return {
      items: enriched,
      nextCursor,
      count: enriched.length,
    };
  }

  /**
   * Helper para construir cláusulas Prisma de categoria
   */
  private static buildCategoryFilter(category?: string) {
    if (!category || category === "ALL") return {};

    switch (category) {
      case "AUTH":
        return {
          OR: [
            { action: { startsWith: "auth." } },
            { action: { startsWith: "login." } },
            { action: { startsWith: "session." } },
            { action: { startsWith: "mfa." } },
            { action: { startsWith: "password." } },
          ],
        };
      case "DEPLOY":
        return {
          OR: [
            { action: { startsWith: "deployment." } },
            { action: { startsWith: "deployment_" } },
            { action: { startsWith: "deploy." } },
          ],
        };
      case "GITHUB":
        return {
          OR: [
            { action: { startsWith: "github." } },
            { action: { startsWith: "github_" } },
          ],
        };
      case "EASYPANEL":
        return {
          action: { startsWith: "easypanel." },
        };
      case "COMPANY":
        return {
          OR: [
            { action: { startsWith: "company." } },
            { action: { startsWith: "tenant." } },
            { action: { startsWith: "admin.tenant." } },
            { action: { startsWith: "team." } },
          ],
        };
      case "PLAN":
        return {
          OR: [
            { action: { startsWith: "plan." } },
            { action: { startsWith: "admin.plan." } },
            { action: { startsWith: "subscription." } },
            { action: { startsWith: "admin.subscription." } },
          ],
        };
      case "FINANCE":
        return {
          OR: [
            { action: { startsWith: "admin.cost" } },
            { action: { startsWith: "finance." } },
            { action: { startsWith: "payment." } },
          ],
        };
      case "SECURITY":
        return {
          OR: [
            { action: { startsWith: "security." } },
            { action: { contains: "blocked" } },
            { action: { contains: "suspended" } },
          ],
        };
      case "ADMIN":
        return {
          OR: [
            { action: { startsWith: "admin." } },
            { action: { startsWith: "platform." } },
            { action: { startsWith: "audit." } },
          ],
        };
      default:
        return {};
    }
  }

  /**
   * Obtém detalhes de um log específico
   */
  static async getDetail(id: string) {
    const log = assertFound(
      await prisma.auditLog.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          tenant: { select: { id: true, name: true } },
        },
      }),
      "Registro de auditoria não encontrado."
    );

    const meta = redactMetadata(log.metadata) as Record<string, unknown> | null;
    const category = this.deriveCategory(log.action);
    const severity = this.deriveSeverity(log.action, meta);

    return {
      id: log.id,
      action: log.action,
      category,
      severity,
      entity: log.entity,
      entityId: log.entityId,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
      metadata: meta,
      user: log.user,
      tenant: log.tenant,
    };
  }

  /**
   * Limpa registros operacionais de auditoria preservando evidências críticas de segurança
   */
  static async clearPlatformLogs(params: { confirm: string; userId: string; ip?: string }) {
    if (params.confirm.trim().toUpperCase() !== "LIMPAR AUDITORIA") {
      throw new AppError(
        'Confirme digitando exatamente "LIMPAR AUDITORIA" para limpar o histórico.',
        400,
        "CONFIRMATION_REQUIRED"
      );
    }

    // Registra a solicitação de limpeza
    await this.record({
      userId: params.userId,
      action: "audit.history.clear_requested",
      entity: "audit_log",
      ip: params.ip,
    });

    // Ações de segurança que NUNCA devem ser apagadas
    const IMMUTABLE_SECURITY_ACTIONS = [
      "audit.history.cleared",
      "audit.history.clear_requested",
      "audit.history.clear_failed",
      "admin.logs.cleared",
      "auth.mfa.enabled",
      "auth.mfa.disabled",
      "security.threat_detected",
    ];

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        action: { notIn: IMMUTABLE_SECURITY_ACTIONS },
      },
    });

    // Registra a evidência imutável da limpeza realizada
    await this.record({
      userId: params.userId,
      action: "audit.history.cleared",
      entity: "audit_log",
      metadata: {
        deletedCount: deleted.count,
        timestamp: new Date().toISOString(),
        scope: "all",
      },
      ip: params.ip,
    });

    return {
      ok: true,
      deleted: deleted.count,
      message: `Histórico de auditoria limpo com sucesso. ${deleted.count} registro(s) administrativo(s) removido(s). Registros de segurança protegidos foram preservados.`,
    };
  }

  /**
   * Limpa registros operacionais de auditoria de uma empresa específica
   */
  static async clearTenantLogs(params: {
    tenantId: string;
    confirm: string;
    userId: string;
    ip?: string;
  }) {
    const trimmedConfirm = params.confirm.trim().toUpperCase();
    if (trimmedConfirm !== "LIMPAR" && trimmedConfirm !== "LIMPAR EMPRESA") {
      throw new AppError(
        'Confirme digitando "LIMPAR" para limpar os logs desta empresa.',
        400,
        "CONFIRMATION_REQUIRED"
      );
    }

    assertFound(await prisma.tenant.findUnique({ where: { id: params.tenantId } }));

    const IMMUTABLE_SECURITY_ACTIONS = [
      "audit.history.cleared",
      "admin.tenant.logs.cleared",
      "auth.mfa.enabled",
      "auth.mfa.disabled",
    ];

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        tenantId: params.tenantId,
        action: { notIn: IMMUTABLE_SECURITY_ACTIONS },
      },
    });

    await this.record({
      userId: params.userId,
      tenantId: params.tenantId,
      action: "admin.tenant.logs.cleared",
      entity: "audit_log",
      entityId: params.tenantId,
      metadata: {
        deletedCount: deleted.count,
        scope: "tenant",
      },
      ip: params.ip,
    });

    return {
      ok: true,
      deleted: deleted.count,
      message: `${deleted.count} log(s) da empresa removido(s).`,
    };
  }
}

/**
 * Função helper de auditoria central mantida para compatibilidade total em toda a codebase
 */
export async function audit(params: AuditRecordParams) {
  return AuditService.record(params);
}
