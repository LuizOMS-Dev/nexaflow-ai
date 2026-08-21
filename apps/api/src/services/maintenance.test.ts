import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMaintenanceState,
  getPublicMaintenanceStatus,
  setGlobalMaintenanceState,
  setSectionMaintenanceState,
  isMaintenanceActive,
  isSectionMaintenanceActive,
  assertSectionAvailable,
  createMaintenanceError,
  createSectionMaintenanceError,
  _resetMaintenanceCache,
} from "./maintenance";
import {
  ALL_SECTIONS,
  TENANT_SECTIONS,
  resolveSectionFromPath,
  TenantSection,
} from "./maintenance-sections";
import { prisma } from "../lib/prisma";
import { AuditService } from "./audit";
import type { JwtUser } from "../plugins/auth";

vi.mock("./audit", () => ({
  AuditService: {
    record: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Comprehensive Maintenance Suite (Global + 14 Sections)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMaintenanceCache();
  });

  it("retorna estado desativado e 14 seções disponíveis por padrão", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue(null);

    const state = await getMaintenanceState();
    expect(state.enabled).toBe(false);
    expect(state.title).toBe("Estamos em manutenção");
    expect(Object.keys(state.sections)).toHaveLength(14);

    for (const sec of ALL_SECTIONS) {
      expect(state.sections[sec]?.enabled).toBe(false);
      expect(state.sections[sec]?.title).toBe(TENANT_SECTIONS[sec].defaultTitle);
    }
  });

  it("retorna apenas dados públicos seguros (oculta internalReason)", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {
        enabled: true,
        title: "Atualização Programada",
        message: "Voltamos em 10 minutos",
        estimatedEnd: "05:30",
        internalReason: "SENHA_SECRETA_DO_BANCO_NAO_VAZAR",
        sections: {
          CONVERSATIONS: {
            enabled: true,
            title: "Conversas em manutenção",
            message: "Ajustando WAHA",
            estimatedEnd: "05:15",
            internalReason: "MOTIVO_CONFIDENCIAL_INTERNO",
          },
        },
      },
      updatedAt: new Date(),
    } as any);

    const publicStatus = await getPublicMaintenanceStatus();
    expect(publicStatus.enabled).toBe(true);
    expect(publicStatus.title).toBe("Atualização Programada");
    expect((publicStatus as any).internalReason).toBeUndefined();

    expect(publicStatus.sections.CONVERSATIONS.enabled).toBe(true);
    expect(publicStatus.sections.CONVERSATIONS.title).toBe("Conversas em manutenção");
    expect((publicStatus.sections.CONVERSATIONS as any).internalReason).toBeUndefined();
  });

  it("ativa e desativa manutenção global com auditoria granular", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue(null);
    const upsertSpy = vi.spyOn(prisma.platformSetting, "upsert").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {},
      updatedAt: new Date(),
    } as any);

    const enabledState = await setGlobalMaintenanceState(
      {
        enabled: true,
        title: "Manutenção Geral",
        message: "Servidores em upgrade.",
        estimatedEnd: "06:00",
        internalReason: "Upgrade cluster PostgreSQL",
      },
      { id: "usr_admin_1", email: "admin@nexaflow.ai" }
    );

    expect(enabledState.enabled).toBe(true);
    expect(AuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "maintenance.global.enabled",
        entityId: "global_maintenance",
        metadata: expect.objectContaining({
          enabled: true,
          internalReason: "Upgrade cluster PostgreSQL",
        }),
      })
    );

    const disabledState = await setGlobalMaintenanceState(
      { enabled: false },
      { id: "usr_admin_1", email: "admin@nexaflow.ai" }
    );

    expect(disabledState.enabled).toBe(false);
    expect(AuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "maintenance.global.disabled",
        entityId: "global_maintenance",
      })
    );
  });

  it("ativa e desativa manutenção para cada uma das 14 seções individuais", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.platformSetting, "upsert").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {},
      updatedAt: new Date(),
    } as any);

    for (const sec of ALL_SECTIONS) {
      _resetMaintenanceCache();
      const updated = await setSectionMaintenanceState(
        sec,
        {
          enabled: true,
          title: `${TENANT_SECTIONS[sec].label} Indisponível`,
          message: "Manutenção técnica em andamento.",
          estimatedEnd: "05:45",
          internalReason: `Migração do módulo ${sec}`,
        },
        { id: "usr_admin_1", email: "admin@nexaflow.ai" }
      );

      expect(updated.sections[sec]?.enabled).toBe(true);
      expect(updated.sections[sec]?.title).toBe(`${TENANT_SECTIONS[sec].label} Indisponível`);
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "maintenance.section.enabled",
          entityId: `maintenance_section_${sec.toLowerCase()}`,
          metadata: expect.objectContaining({
            section: sec,
            enabled: true,
          }),
        })
      );
    }
  });

  it("aplica regras de prioridade estritas: Global ON bloqueia todas; Section ON bloqueia somente a seção", async () => {
    // 1. Manutenção Global = ATIVA
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {
        enabled: true,
        title: "Global On",
        message: "Bloqueio Total",
        sections: {
          CONVERSATIONS: { enabled: false },
          CONTACTS: { enabled: false },
        },
      },
      updatedAt: new Date(),
    } as any);
    _resetMaintenanceCache();

    const tenantUser = { sub: "usr_tenant_1", tenantId: "t_1", platformRole: "USER" } as unknown as JwtUser;

    // Tentar acessar CONVERSATIONS com Global ON -> lança MAINTENANCE_MODE
    await expect(assertSectionAvailable("CONVERSATIONS", tenantUser)).rejects.toThrow();

    // 2. Manutenção Global = OFF, mas CONVERSATIONS = ON
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {
        enabled: false,
        sections: {
          CONVERSATIONS: {
            enabled: true,
            title: "Conversas em manutenção",
            message: "Ajustes no chat",
          },
          CONTACTS: {
            enabled: false,
          },
        },
      },
      updatedAt: new Date(),
    } as any);
    _resetMaintenanceCache();

    // CONVERSATIONS deve ser bloqueado com SECTION_MAINTENANCE
    await expect(assertSectionAvailable("CONVERSATIONS", tenantUser)).rejects.toThrow(
      "Ajustes no chat"
    );

    // CONTACTS, PIPELINE, AGENTS etc devem PASSAR sem erro
    await expect(assertSectionAvailable("CONTACTS", tenantUser)).resolves.toBeUndefined();
    await expect(assertSectionAvailable("PIPELINE", tenantUser)).resolves.toBeUndefined();
    await expect(assertSectionAvailable("AGENTS", tenantUser)).resolves.toBeUndefined();
  });

  it("Superadmin tem bypass seguro e nunca é bloqueado em nenhuma seção nem em global", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {
        enabled: true,
        sections: {
          CONVERSATIONS: { enabled: true },
          CONTACTS: { enabled: true },
        },
      },
      updatedAt: new Date(),
    } as any);
    _resetMaintenanceCache();

    const superadminUser = {
      sub: "usr_super_1",
      platformRole: "SUPERADMIN",
      imp: false,
    } as unknown as JwtUser;

    for (const sec of ALL_SECTIONS) {
      await expect(assertSectionAvailable(sec, superadminUser)).resolves.toBeUndefined();
    }
  });

  it("resolve corretamente o ID da seção a partir do caminho de rota (resolveSectionFromPath)", () => {
    expect(resolveSectionFromPath("/app")).toBe("HOME");
    expect(resolveSectionFromPath("/app/dashboard")).toBe("HOME");
    expect(resolveSectionFromPath("/app/inbox")).toBe("CONVERSATIONS");
    expect(resolveSectionFromPath("/app/inbox/conv_123")).toBe("CONVERSATIONS");
    expect(resolveSectionFromPath("/app/contacts")).toBe("CONTACTS");
    expect(resolveSectionFromPath("/app/crm")).toBe("PIPELINE");
    expect(resolveSectionFromPath("/app/finance")).toBe("FINANCE");
    expect(resolveSectionFromPath("/app/tasks")).toBe("TASKS");
    expect(resolveSectionFromPath("/app/campaigns")).toBe("CAMPAIGNS");
    expect(resolveSectionFromPath("/app/automations")).toBe("FLOWS");
    expect(resolveSectionFromPath("/app/ai")).toBe("AGENTS");
    expect(resolveSectionFromPath("/app/knowledge")).toBe("KNOWLEDGE");
    expect(resolveSectionFromPath("/app/team")).toBe("TEAM");
    expect(resolveSectionFromPath("/app/integrations")).toBe("CHANNELS");
    expect(resolveSectionFromPath("/app/reports")).toBe("REPORTS");
    expect(resolveSectionFromPath("/app/settings")).toBe("SETTINGS");
  });
});
