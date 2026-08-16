import { describe, expect, it } from "vitest";
import { humanizeAuditAction } from "./audit-labels";
import { pluralizePt } from "./utils";

describe("Audit Labels & Formatters", () => {
  describe("humanizeAuditAction", () => {
    it("humaniza eventos exatos conhecidos", () => {
      expect(humanizeAuditAction("auth.logout")).toBe("Logout administrativo realizado");
      expect(humanizeAuditAction("admin.impersonate")).toBe("Acesso como empresa iniciado");
      expect(humanizeAuditAction("admin.impersonate.stop")).toBe("Acesso como empresa encerrado");
      expect(humanizeAuditAction("tenant.onboarding.completed")).toBe("Configuração da empresa concluída");
      expect(humanizeAuditAction("auth.mfa.enabled")).toBe("Autenticação em duas etapas ativada");
      expect(humanizeAuditAction("auth.2fa.enabled")).toBe("Autenticação em duas etapas ativada");
      expect(humanizeAuditAction("auth.password.changed")).toBe("Senha de acesso alterada");
      expect(humanizeAuditAction("tenant.created")).toBe("Empresa criada");
      expect(humanizeAuditAction("user.created")).toBe("Novo usuário cadastrado");
      expect(humanizeAuditAction("subscription.created")).toBe("Assinatura criada");
    });

    it("aplica prefixos ou fallback seguro para eventos não mapeados diretamente", () => {
      expect(humanizeAuditAction("whatsapp.session.disconnected")).toContain("WhatsApp");
      expect(humanizeAuditAction("custom_event_without_prefix")).toBe("Custom Event Without Prefix");
      expect(humanizeAuditAction("")).toBe("Evento");
    });
  });

  describe("pluralizePt", () => {
    it("retorna singular para 1 e -1", () => {
      expect(pluralizePt(1, "empresa", "empresas")).toBe("empresa");
      expect(pluralizePt(-1, "empresa", "empresas")).toBe("empresa");
      expect(pluralizePt(1, "cliente", "clientes")).toBe("cliente");
    });

    it("retorna plural para 0 e 2+", () => {
      expect(pluralizePt(0, "empresa", "empresas")).toBe("empresas");
      expect(pluralizePt(2, "empresa", "empresas")).toBe("empresas");
      expect(pluralizePt(5, "pagante", "pagantes")).toBe("pagantes");
      expect(pluralizePt(10, "execução acumulada", "execuções acumuladas")).toBe("execuções acumuladas");
    });
  });
});
