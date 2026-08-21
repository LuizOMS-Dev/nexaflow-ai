import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startImpersonationSession,
  stopImpersonationSession,
} from "./impersonation";
import { prisma } from "../../lib/prisma";
import { audit } from "../audit";
import * as sessionModule from "../security/session";
import * as stepUpModule from "../security/step-up";
import type { JwtUser } from "../../plugins/auth";

vi.mock("../audit", () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../security/security-event", () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Impersonation Support Mode Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(stepUpModule, "requireSuperadminMfa").mockResolvedValue(undefined as any);
    vi.spyOn(stepUpModule, "requireRecentAuthentication").mockResolvedValue(undefined as any);
  });

  const mockSuperadmin: JwtUser = {
    sub: "usr_super_1",
    email: "superadmin@nexaflow.ai",
    name: "Super Admin",
    platformRole: "SUPERADMIN",
    tenantId: null,
    role: null,
    sid: "ses_super_origin",
    imp: false,
    impBy: null,
  };

  it("inicia sessão de suporte com impersonation.started e sem criar membership", async () => {
    const mockTenant = {
      id: "ten_company_1",
      name: "Empresa XPTO",
      slug: "empresa-xpto",
      plan: { id: "p1", name: "Pro" },
    };

    const mockAdminUser = {
      id: "usr_client_admin",
      email: "admin@empresa.com",
      name: "Cliente Admin",
      platformRole: "USER",
    };

    const mockMembership = {
      tenantId: mockTenant.id,
      userId: mockAdminUser.id,
      role: "ADMIN",
      isActive: true,
      status: "ACTIVE",
    };

    vi.spyOn(prisma.tenant, "findUnique").mockResolvedValue(mockTenant as any);
    vi.spyOn(prisma.membership, "findFirst").mockResolvedValue(mockMembership as any);
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockAdminUser as any);
    vi.spyOn(sessionModule, "createAuthSession").mockResolvedValue({
      session: {
        id: "ses_imp_1",
        impersonationExpiresAt: new Date(Date.now() + 7200000),
      } as any,
      refreshToken: "rf_token_secret",
    });
    vi.spyOn(sessionModule, "revokeSession").mockResolvedValue(undefined as any);

    const jwtSign = vi.fn().mockReturnValue("jwt_impersonated_token");

    const result = await startImpersonationSession(
      mockSuperadmin,
      {
        tenantId: mockTenant.id,
        reason: "Atendimento de suporte para configuração de canais",
      },
      { ip: "127.0.0.1", userAgent: "Vitest Agent", jwtSign }
    );

    expect(result.accessToken).toBe("jwt_impersonated_token");
    expect(result.impersonation.active).toBe(true);
    expect(result.impersonation.by).toBe(mockSuperadmin.sub);
    expect(result.tenant.id).toBe(mockTenant.id);

    // Auditoria granular
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "impersonation.started",
        userId: mockSuperadmin.sub,
        tenantId: mockTenant.id,
      })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.impersonate",
        userId: mockSuperadmin.sub,
        tenantId: mockTenant.id,
      })
    );
  });

  it("rejeita motivo de impersonação com menos de 8 caracteres", async () => {
    await expect(
      startImpersonationSession(
        mockSuperadmin,
        {
          tenantId: "ten_1",
          reason: "curto",
        },
        { ip: "127.0.0.1", jwtSign: vi.fn() }
      )
    ).rejects.toThrow("O motivo da impersonação deve ter pelo menos 8 caracteres.");
  });

  it("encerra sessão de suporte, calcula duração e restaura Superadmin limpo", async () => {
    const impersonatedUser: JwtUser = {
      sub: "usr_client_admin",
      email: "admin@empresa.com",
      name: "Cliente Admin",
      platformRole: "SUPERADMIN",
      tenantId: "ten_company_1",
      role: "ADMIN",
      sid: "ses_imp_1",
      imp: true,
      impBy: "usr_super_1",
    };

    const sessionStartTime = new Date(Date.now() - 45000); // 45 segundos atrás
    vi.spyOn(prisma.authSession, "findUnique").mockResolvedValue({
      id: "ses_imp_1",
      createdAt: sessionStartTime,
      tenantId: "ten_company_1",
      impersonationReason: "Atendimento de suporte para configuração de canais",
    } as any);

    const mockSuperadminDb = {
      id: "usr_super_1",
      email: "superadmin@nexaflow.ai",
      name: "Super Admin",
      platformRole: "SUPERADMIN",
      memberships: [],
    };

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockSuperadminDb as any);
    const revokeSpy = vi.spyOn(sessionModule, "revokeSession").mockResolvedValue(undefined as any);
    vi.spyOn(sessionModule, "createAuthSession").mockResolvedValue({
      session: { id: "ses_restored_super_1" } as any,
      refreshToken: "rf_super_restored",
    });

    const jwtSign = vi.fn().mockReturnValue("jwt_restored_super_token");

    const result = await stopImpersonationSession(impersonatedUser, {
      ip: "127.0.0.1",
      userAgent: "Vitest Agent",
      jwtSign,
    });

    // Revogou a sessão impersonada
    expect(revokeSpy).toHaveBeenCalledWith("ses_imp_1", "impersonation_stop");

    // Retorna identidade limpa de Superadmin
    expect(result.user.platformRole).toBe("SUPERADMIN");
    expect(result.tenant).toBeNull();
    expect(result.impersonation.active).toBe(false);
    expect(result.accessToken).toBe("jwt_restored_super_token");

    // Auditoria de encerramento com duração e reason
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "impersonation.ended",
        userId: "usr_super_1",
        tenantId: "ten_company_1",
        metadata: expect.objectContaining({
          durationMs: expect.any(Number),
          reason: "Atendimento de suporte para configuração de canais",
        }),
      })
    );
  });
});
