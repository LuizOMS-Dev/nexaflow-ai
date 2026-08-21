import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getMaintenanceState,
  setMaintenanceState,
  getPublicMaintenanceStatus,
  isMaintenanceActive,
  createMaintenanceError,
  _resetMaintenanceCache,
} from "./maintenance";
import { prisma } from "../lib/prisma";
import { AuditService } from "./audit";

describe("Global Maintenance Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMaintenanceCache();
    vi.spyOn(AuditService, "record").mockResolvedValue({} as any);
  });

  it("retorna estado desativado por padrão", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue(null);

    const state = await getMaintenanceState();
    expect(state.enabled).toBe(false);
    expect(state.title).toBe("Estamos em manutenção");
    expect(state.message).toContain("Estamos realizando melhorias");
  });

  it("retorna apenas dados públicos seguros", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {
        enabled: true,
        title: "Manutenção do Banco de Dados",
        message: "Voltamos em 15 minutos",
        estimatedEnd: "04:30",
        internalReason: "SECRET_DATABASE_UPGRADE_ON_NODE_4",
      },
      updatedAt: new Date(),
    } as any);

    const publicStatus = await getPublicMaintenanceStatus();
    expect(publicStatus.enabled).toBe(true);
    expect(publicStatus.title).toBe("Manutenção do Banco de Dados");
    expect(publicStatus.message).toBe("Voltamos em 15 minutos");
    expect(publicStatus.estimatedEnd).toBe("04:30");
    // Garante que o motivo interno NÃO é exposto
    expect((publicStatus as any).internalReason).toBeUndefined();
  });

  it("cria erro 503 padronizado de MAINTENANCE_MODE", () => {
    const state = {
      enabled: true,
      title: "Estamos em manutenção",
      message: "Volte logo",
      estimatedEnd: "05:00",
      updatedAt: new Date().toISOString(),
    };

    const err = createMaintenanceError(state);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("MAINTENANCE_MODE");
    expect(err.details).toEqual({
      maintenance: {
        title: "Estamos em manutenção",
        message: "Volte logo",
        estimatedEnd: "05:00",
      },
    });
  });

  it("ativa e persiste modo de manutenção com auditoria", async () => {
    vi.spyOn(prisma.platformSetting, "findUnique").mockResolvedValue(null);
    const upsertSpy = vi.spyOn(prisma.platformSetting, "upsert").mockResolvedValue({
      id: "set_1",
      key: "global_maintenance",
      value: {},
      updatedAt: new Date(),
    } as any);

    const updated = await setMaintenanceState(
      {
        enabled: true,
        title: "Atualização Crítica",
        message: "Estamos atualizando nossos servidores.",
        estimatedEnd: "05:00",
        internalReason: "Troca de versão do PostgreSQL",
      },
      { id: "usr_admin_123", email: "admin@nexaflow.ai" }
    );

    expect(updated.enabled).toBe(true);
    expect(updated.title).toBe("Atualização Crítica");
    expect(updated.estimatedEnd).toBe("05:00");
    expect(updated.internalReason).toBe("Troca de versão do PostgreSQL");
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "global_maintenance" },
      })
    );
    expect(AuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "maintenance.enabled",
        entityId: "global_maintenance",
      })
    );
  });
});
