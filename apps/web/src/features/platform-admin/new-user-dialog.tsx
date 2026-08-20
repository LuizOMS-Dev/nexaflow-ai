"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Shield } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Checkbox, ConsequenceBanner, Modal, RadioGroup, useToast } from "@/components/ui";
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
type AccessMethod = "invite" | "temporary_password";

const WEAK_PASSWORDS = new Set([
  "123456",
  "12345678",
  "123456789",
  "password",
  "senha",
  "senha123",
  "admin123",
  "qwerty",
  "abc123",
  "nexaflow",
  "nexaflow123",
  "password1",
  "111111",
  "000000",
]);

function passwordChecks(password: string) {
  return [
    { ok: password.length >= 10, label: "Pelo menos 10 caracteres" },
    { ok: password.length > 0 && password.length <= 128, label: "No máximo 128 caracteres" },
    { ok: password.length > 0 && !WEAK_PASSWORDS.has(password.toLowerCase()), label: "Não use senhas óbvias" },
    {
      ok: password.length > 0 && (!/^\d+$/.test(password) || password.length >= 12),
      label: "Não use apenas números curtos",
    },
  ];
}

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
  const [accessMethod, setAccessMethod] = useState<AccessMethod>("invite");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [temporaryPasswordConfirm, setTemporaryPasswordConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingUser, setExistingUser] = useState(false);

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
    setExistingUser(false);
  }

  const mut = useMutation({
    mutationFn: async () => {
      const isTemp = accessMethod === "temporary_password" && temporaryPassword.trim().length > 0;
      const firstAccess = isTemp
        ? { accessMethod: "temporary_password" as const, temporaryPassword: temporaryPassword.trim() }
        : { accessMethod: "invite" as const };
      if (kind === "company") {
        return api<{ createdUser: boolean; reusedUser: boolean }>("/admin/users", {
          method: "POST",
          json: { kind: "company", name: name.trim(), email: email.trim(), tenantId, role, ...firstAccess },
        });
      }
      return api<{ createdUser: boolean; promoted: boolean }>("/admin/users", {
        method: "POST",
        json: { kind: "platform", name: name.trim(), email: email.trim(), ...firstAccess },
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
              : accessMethod === "temporary_password"
                ? "Usuário criado — senha deve ser alterada no primeiro acesso"
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
    setAccessMethod("invite");
    setTemporaryPassword("");
    setTemporaryPasswordConfirm("");
    setInlineIdle();
    onClose();
  }

  async function onEmailBlur() {
    const value = email.trim().toLowerCase();
    if (!value || (kind !== "company" && kind !== "platform") || !value.includes("@")) {
      setExistingUser(false);
      return;
    }
    try {
      const res = await api<{ items: Array<{ email: string }> }>(
        `/admin/users?search=${encodeURIComponent(value)}&limit=8`
      );
      const exists = (res.items || []).some((u) => u.email.toLowerCase() === value);
      setExistingUser(exists);
    } catch {
      setExistingUser(false);
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
    if (accessMethod === "temporary_password") {
      if (temporaryPassword.length < 10) next.temporaryPassword = "A senha deve ter pelo menos 10 caracteres.";
      if (temporaryPassword !== temporaryPasswordConfirm) next.temporaryPasswordConfirm = "As senhas não coincidem.";
    }
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
              onChange={(e) => {
                setEmail(e.target.value);
                if (existingUser) setExistingUser(false);
              }}
              onBlur={() => void onEmailBlur()}
            />
            {errors.email ? <p className="mt-1 text-[12px] text-rose-400">{errors.email}</p> : null}
          </label>
          {kind === "company" ? (
            <>
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
          ) : null}
          {existingUser ? (
            <ConsequenceBanner tone="warning">
              <p>Este usuário já possui uma conta no NexaFlow.</p>
              <p className="mt-1 text-[12px] text-gray-400">
                {kind === "platform"
                  ? "Somente o papel global será atualizado. Senha, MFA e sessões permanecem iguais."
                  : "Será criado somente o vínculo com esta empresa. Senha, MFA e sessões permanecem iguais."}
              </p>
            </ConsequenceBanner>
          ) : (
            <div>
              <span className="mb-1.5 block text-[12px] font-medium text-gray-300">Primeiro acesso</span>
              <RadioGroup
                aria-label="Primeiro acesso"
                value={accessMethod}
                disabled={busy}
                onChange={(v) => setAccessMethod(v as AccessMethod)}
                options={[
                  {
                    value: "invite",
                    label: "Enviar convite por e-mail",
                    description: "O usuário receberá um link seguro para definir sua senha.",
                  },
                  {
                    value: "temporary_password",
                    label: "Definir senha temporária",
                    description:
                      "O administrador define uma senha inicial e o usuário deverá alterá-la no primeiro acesso.",
                  },
                ]}
              />
              {accessMethod === "temporary_password" ? (
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-gray-300">Senha temporária</span>
                    <input
                      className={cn(inputClass, errors.temporaryPassword && "border-rose-400/50")}
                      type="password"
                      autoComplete="new-password"
                      value={temporaryPassword}
                      disabled={busy}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                    />
                    {errors.temporaryPassword ? (
                      <p className="mt-1 text-[12px] text-rose-400">{errors.temporaryPassword}</p>
                    ) : null}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-gray-300">Confirmar senha</span>
                    <input
                      className={cn(inputClass, errors.temporaryPasswordConfirm && "border-rose-400/50")}
                      type="password"
                      autoComplete="new-password"
                      value={temporaryPasswordConfirm}
                      disabled={busy}
                      onChange={(e) => setTemporaryPasswordConfirm(e.target.value)}
                    />
                    {errors.temporaryPasswordConfirm ? (
                      <p className="mt-1 text-[12px] text-rose-400">{errors.temporaryPasswordConfirm}</p>
                    ) : null}
                  </label>
                  <ul className="space-y-1">
                    {passwordChecks(temporaryPassword).map((c) => (
                      <li
                        key={c.label}
                        className={cn(
                          "text-[11.5px]",
                          c.ok ? "text-emerald-400" : "text-gray-500"
                        )}
                      >
                        {c.ok ? "✓" : "○"} {c.label}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[12.5px] text-gray-400">
                    O usuário deverá alterar esta senha no primeiro acesso.
                  </p>
                </div>
              ) : null}
            </div>
          )}
          {kind === "platform" ? (
            <>
              <ConsequenceBanner tone="warning">
                <label className="flex items-start gap-2.5">
                  <Checkbox checked={ack} onCheckedChange={setAck} disabled={busy} className="mt-0.5" />
                  <span>Entendo que este usuário terá acesso administrativo global ao NexaFlow.</span>
                </label>
              </ConsequenceBanner>
              {errors.ack ? <p className="text-[12px] text-rose-400">{errors.ack}</p> : null}
            </>
          ) : null}
          {errors.form ? <p className="text-[12.5px] text-rose-400">{errors.form}</p> : null}
        </div>
      )}
    </Modal>
  );
}
