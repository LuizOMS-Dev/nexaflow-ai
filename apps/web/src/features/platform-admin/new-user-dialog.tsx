"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Shield } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Checkbox, ConsequenceBanner, Modal, useToast } from "@/components/ui";
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
  "h-9 w-full rounded-lg border border-white/[0.08] bg-[#0c0d12] px-3 text-[13px] text-white placeholder-white/35 focus:border-violet-500/60 focus:outline-none disabled:opacity-50";

export function NewUserDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState("AGENT");
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingHint, setExistingHint] = useState<string | null>(null);

  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants", "user-create"],
    queryFn: () =>
      api<{ items: Array<{ id: string; name: string; slug: string }> }>("/admin/tenants?page=1&limit=200"),
    enabled: open,
  });

  const tenantOptions = useMemo(
    () =>
      (tenantsQuery.data?.items || []).map((t) => ({
        value: t.id,
        label: t.name,
        description: t.slug,
      })),
    [tenantsQuery.data]
  );

  useEffect(() => {
    if (!open) return;
    setKind("pick");
    setInlineIdle();
  }, [open]);

  function setInlineIdle() {
    setErrors({});
    setExistingHint(null);
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (kind === "company") {
        return api<{ createdUser: boolean; reusedUser: boolean }>("/admin/users", {
          method: "POST",
          json: { kind: "company", name: name.trim(), email: email.trim(), tenantId, role },
        });
      }
      return api<{ createdUser: boolean; promoted: boolean }>("/admin/users", {
        method: "POST",
        json: { kind: "platform", name: name.trim(), email: email.trim() },
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
      setErrors({ form: msg });
    },
  });

  function resetAndClose() {
    setKind("pick");
    setName("");
    setEmail("");
    setTenantId("");
    setRole("AGENT");
    setAck(false);
    setInlineIdle();
    onClose();
  }

  async function onEmailBlur() {
    const value = email.trim().toLowerCase();
    if (!value || kind !== "company" || !value.includes("@")) {
      setExistingHint(null);
      return;
    }
    try {
      const res = await api<{ items: Array<{ email: string }> }>(
        `/admin/users?search=${encodeURIComponent(value)}&limit=8`
      );
      const exists = (res.items || []).some((u) => u.email.toLowerCase() === value);
      setExistingHint(
        exists
          ? "Este usuário já possui uma conta no NexaFlow. Será criado apenas o vínculo com esta empresa."
          : null
      );
    } catch {
      setExistingHint(null);
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Informe o nome completo.";
    if (name.trim().length > 120) next.name = "Nome muito longo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) next.email = "Informe um e-mail válido.";
    if (kind === "company" && !tenantId) next.tenantId = "Selecione a empresa.";
    if (kind === "company" && !role) next.role = "Selecione o papel.";
    if (kind === "platform" && !ack) next.ack = "Confirme o acesso administrativo global.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const busy = mut.isPending;
  const submitLabel =
    busy
      ? kind === "platform"
        ? "Criando administrador..."
        : "Salvando usuário..."
      : kind === "platform"
        ? "Criar administrador"
        : "Salvar usuário";

  return (
    <Modal
      open={open}
      onClose={() => !busy && resetAndClose()}
      title="Novo usuário"
      description={
        kind === "pick"
          ? "Escolha o tipo de acesso. São permissões diferentes."
          : kind === "company"
            ? "Cria ou vincula uma identidade a uma empresa."
            : "Administradores da plataforma possuem acesso global às áreas administrativas do NexaFlow."
      }
      size="md"
      tone={kind === "platform" ? "warning" : undefined}
      preventClose={busy}
      footer={
        kind === "pick" ? undefined : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4 text-[13px]"
              disabled={busy}
              onClick={() => {
                setKind("pick");
                setInlineIdle();
              }}
            >
              Voltar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 px-4 text-[13px]"
              disabled={busy}
              onClick={() => {
                if (!validate()) return;
                mut.mutate();
              }}
            >
              {submitLabel}
            </button>
          </div>
        )
      }
    >
      {kind === "pick" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-violet-500/50"
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
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-violet-500/50"
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
            <input
              className={cn(inputClass, errors.name && "border-rose-400/50")}
              value={name}
              disabled={busy}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name ? <p className="mt-1 text-[12px] text-rose-400">{errors.name}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-gray-300">E-mail</span>
            <input
              className={cn(inputClass, errors.email && "border-rose-400/50")}
              type="email"
              value={email}
              disabled={busy}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => void onEmailBlur()}
            />
            {errors.email ? <p className="mt-1 text-[12px] text-rose-400">{errors.email}</p> : null}
          </label>
          {kind === "company" ? (
            <>
              {existingHint ? <ConsequenceBanner tone="warning">{existingHint}</ConsequenceBanner> : null}
              <div>
                <span className="mb-1 block text-[12px] font-medium text-gray-300">Empresa</span>
                <Select
                  value={tenantId}
                  onChange={setTenantId}
                  options={tenantOptions}
                  placeholder="Buscar ou selecionar empresa..."
                  searchPlaceholder="Buscar por nome ou slug"
                  searchable
                  matchTriggerWidth
                  disabled={busy}
                  error={Boolean(errors.tenantId)}
                  required
                  aria-label="Empresa"
                />
                {errors.tenantId ? <p className="mt-1 text-[12px] text-rose-400">{errors.tenantId}</p> : null}
              </div>
              <div>
                <span className="mb-1 block text-[12px] font-medium text-gray-300">Papel na empresa</span>
                <Select
                  value={role}
                  onChange={setRole}
                  options={[...MEMBER_ROLES]}
                  matchTriggerWidth
                  preferredPlacement="top"
                  disabled={busy}
                  error={Boolean(errors.role)}
                  required
                  aria-label="Papel na empresa"
                />
                {errors.role ? <p className="mt-1 text-[12px] text-rose-400">{errors.role}</p> : null}
              </div>
            </>
          ) : (
            <ConsequenceBanner tone="warning">
              <label className="flex items-start gap-2.5">
                <Checkbox checked={ack} onCheckedChange={setAck} disabled={busy} className="mt-0.5" />
                <span>Entendo que este usuário terá acesso administrativo global ao NexaFlow.</span>
              </label>
            </ConsequenceBanner>
          )}
          {errors.ack ? <p className="text-[12px] text-rose-400">{errors.ack}</p> : null}
          {errors.form ? <p className="text-[12.5px] text-rose-400">{errors.form}</p> : null}
        </div>
      )}
    </Modal>
  );
}
