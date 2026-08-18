"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Shield } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Checkbox, Modal, useToast } from "@/components/ui";
import { Select } from "@/components/ui-select";
import { cn } from "@/lib/utils";

const MEMBER_ROLES = [
  { value: "ADMIN", label: "Administrador" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "AGENT", label: "Atendente" },
  { value: "SALES", label: "Comercial" },
  { value: "READONLY", label: "Somente leitura" },
] as const;

type Kind = "pick" | "company" | "platform";

type Props = {
  open: boolean;
  onClose: () => void;
};

const inputClass =
  "h-9 w-full rounded-lg border border-white/[0.08] bg-[#0c0d12] px-3 text-[13px] text-white placeholder-white/35 focus:border-violet-500/60 focus:outline-none";

export function NewUserDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState("AGENT");
  const [tenantSearch, setTenantSearch] = useState("");
  const [ack, setAck] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [existingHint, setExistingHint] = useState<string | null>(null);

  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants", "user-create"],
    queryFn: () =>
      api<{ items: Array<{ id: string; name: string; slug: string }> }>("/admin/tenants?page=1&limit=100"),
    enabled: open,
  });

  const tenantOptions = useMemo(() => {
    const q = tenantSearch.trim().toLowerCase();
    return (tenantsQuery.data?.items || [])
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
      .map((t) => ({ value: t.id, label: t.name, description: t.slug }));
  }, [tenantsQuery.data, tenantSearch]);

  const mut = useMutation({
    mutationFn: async () => {
      if (kind === "company") {
        return api<{ createdUser: boolean; reusedUser: boolean }>("/admin/users", {
          method: "POST",
          json: { kind: "company", name, email, tenantId, role },
        });
      }
      return api<{ createdUser: boolean; promoted: boolean }>("/admin/users", {
        method: "POST",
        json: { kind: "platform", name, email },
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
      void qc.invalidateQueries({ queryKey: ["admin-tenant"] });
      toast({
        kind: "success",
        title:
          kind === "platform"
            ? "Administrador da plataforma pronto"
            : res && "reusedUser" in res && res.reusedUser
              ? "Usuário vinculado à empresa"
              : "Usuário criado",
      });
      resetAndClose();
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError ? e.message : e.message;
      setInlineError(msg);
    },
  });

  function resetAndClose() {
    setKind("pick");
    setName("");
    setEmail("");
    setTenantId("");
    setRole("AGENT");
    setTenantSearch("");
    setAck(false);
    setInlineError(null);
    setExistingHint(null);
    onClose();
  }

  function onEmailBlur() {
    const value = email.trim().toLowerCase();
    if (!value || kind !== "company") {
      setExistingHint(null);
      return;
    }
    setExistingHint("Se esta conta já existir, ela será apenas adicionada à empresa. Senha e MFA não mudam.");
  }

  const canSubmitCompany = name.trim().length >= 2 && email.includes("@") && Boolean(tenantId);
  const canSubmitPlatform = name.trim().length >= 2 && email.includes("@") && ack;

  return (
    <Modal
      open={open}
      onClose={() => !mut.isPending && resetAndClose()}
      title="Novo usuário"
      description={
        kind === "pick"
          ? "Escolha o tipo de acesso. São permissões diferentes."
          : kind === "company"
            ? "Cria ou vincula uma identidade a uma empresa."
            : "Administradores da plataforma possuem acesso global às áreas administrativas do NexaFlow."
      }
      size="md"
      preventClose={mut.isPending}
      footer={
        kind === "pick" ? undefined : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4 text-[13px]"
              disabled={mut.isPending}
              onClick={() => {
                setKind("pick");
                setInlineError(null);
              }}
            >
              Voltar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 px-4 text-[13px]"
              disabled={mut.isPending || (kind === "company" ? !canSubmitCompany : !canSubmitPlatform)}
              onClick={() => {
                setInlineError(null);
                mut.mutate();
              }}
            >
              {mut.isPending
                ? "Salvando…"
                : kind === "platform"
                  ? "Criar administrador"
                  : "Salvar usuário"}
            </button>
          </div>
        )
      }
    >
      {kind === "pick" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left hover:bg-white/[0.04]"
            onClick={() => setKind("company")}
          >
            <Building2 className="mb-2 h-4 w-4 text-violet-300" />
            <p className="text-[13px] font-semibold text-white">Usuário de empresa</p>
            <p className="mt-1 text-[12px] text-gray-500">
              Cria ou vincula alguém a uma empresa, com papel local.
            </p>
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left hover:bg-white/[0.04]"
            onClick={() => setKind("platform")}
          >
            <Shield className="mb-2 h-4 w-4 text-amber-300" />
            <p className="text-[13px] font-semibold text-white">Administrador da plataforma</p>
            <p className="mt-1 text-[12px] text-gray-500">
              Acesso global às áreas administrativas. Sem vínculo automático com empresa.
            </p>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-gray-300">Nome completo</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-gray-300">E-mail</span>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={onEmailBlur}
            />
          </label>
          {kind === "company" ? (
            <>
              {existingHint ? (
                <p className="text-[12px] text-amber-300/90">{existingHint}</p>
              ) : null}
              <div>
                <span className="mb-1 block text-[12px] font-medium text-gray-300">Empresa</span>
                <input
                  className={cn(inputClass, "mb-2")}
                  placeholder="Buscar empresa…"
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                />
                <Select
                  value={tenantId}
                  onChange={setTenantId}
                  options={tenantOptions}
                  placeholder="Selecionar empresa"
                  matchTriggerWidth
                  aria-label="Empresa"
                />
              </div>
              <div>
                <span className="mb-1 block text-[12px] font-medium text-gray-300">Papel na empresa</span>
                <Select
                  value={role}
                  onChange={setRole}
                  options={[...MEMBER_ROLES]}
                  matchTriggerWidth
                  aria-label="Papel na empresa"
                />
              </div>
            </>
          ) : (
            <label className="flex items-start gap-2.5 text-[12.5px] text-gray-300">
              <Checkbox checked={ack} onCheckedChange={setAck} className="mt-0.5" />
              <span>Entendo que este usuário terá acesso administrativo global ao NexaFlow.</span>
            </label>
          )}
          {inlineError ? <p className="text-[12.5px] text-rose-400">{inlineError}</p> : null}
        </div>
      )}
    </Modal>
  );
}
