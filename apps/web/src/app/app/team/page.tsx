"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Mail,
  Plus,
  Search,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  FormField,
  FormSection,
  Modal,
  PageHeader,
  Spinner,
  useToast,
} from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";

type Member = {
  id: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    avatarType?: string | null;
    avatarPresetId?: string | null;
    avatarColor?: string | null;
    lastLoginAt?: string | null;
    isActive?: boolean;
  };
};

type PendingInvite = {
  id: string;
  email: string;
  name: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

type TeamResponse = {
  members: Member[];
  pendingInvites: PendingInvite[];
  seats: { used: number; pending: number; max: number };
};

const ROLE_OPTIONS = [
  {
    value: "ADMIN",
    label: "Administrador",
    help: "Equipe, canais, configurações e permissões amplas.",
  },
  {
    value: "SUPERVISOR",
    label: "Supervisor",
    help: "Acompanha atendimentos e equipe operacional.",
  },
  {
    value: "AGENT",
    label: "Atendente",
    help: "Conversas, contatos e o dia a dia do atendimento.",
  },
  {
    value: "SALES",
    label: "Comercial",
    help: "Contatos, funil e oportunidades de venda.",
  },
  {
    value: "READONLY",
    label: "Somente leitura",
    help: "Consulta informações sem alterar dados.",
  },
] as const;

const roleLabel: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label])
);

function roleBadgeClass(role: string) {
  switch (role) {
    case "ADMIN":
      return "badge-brand";
    case "SUPERVISOR":
      return "badge-warning";
    case "AGENT":
      return "badge-success";
    case "SALES":
      return "badge-neutral";
    case "READONLY":
      return "badge-neutral";
    default:
      return "badge-neutral";
  }
}

function seatsNearLimit(seats: TeamResponse["seats"]) {
  if (!seats.max || seats.max <= 0) return false;
  return seats.used + seats.pending >= seats.max;
}

export default function TeamPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const inviteBtnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "AGENT",
  });
  const [fieldError, setFieldError] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["team"],
    queryFn: () => api<TeamResponse>("/team"),
  });

  const members = data?.members ?? [];
  const pendingInvites = data?.pendingInvites ?? [];
  const seats = data?.seats ?? { used: 0, pending: 0, max: 0 };

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const hay = `${m.user.name} ${m.user.email} ${roleLabel[m.role] || m.role}`.toLowerCase();
      return hay.includes(q);
    });
  }, [members, search]);

  const inviteMutation = useMutation({
    mutationFn: () =>
      api<{
        message?: string;
        inviteTokenDevOnly?: string;
        email?: string;
        mailDelivered?: boolean;
      }>("/team/invite", {
        method: "POST",
        json: {
          email: form.email.trim(),
          name: form.name.trim() || undefined,
          role: form.role,
        },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["team"] });
      setOpen(false);
      setForm({ email: "", name: "", role: "AGENT" });
      setFieldError("");
      const email = res.email || form.email.trim();
      toast({
        kind: res.mailDelivered ? "success" : "warning",
        title: res.mailDelivered ? "Convite enviado" : "Convite criado sem entrega",
        description: res.mailDelivered
          ? `Enviamos o link de acesso para ${email}.`
          : res.inviteTokenDevOnly
            ? `${email} · ambiente local sem entrega externa; o token de teste foi gerado.`
            : res.message || "Verifique o serviço de e-mail e reenvie o convite.",
      });
      requestAnimationFrame(() => inviteBtnRef.current?.focus());
    },
    onError: (err) => {
      setFieldError(
        err instanceof Error ? err.message : "Não foi possível enviar o convite."
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/team/invites/${id}/revoke`, { method: "POST", json: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["team"] });
      toast({ kind: "success", title: "Convite cancelado" });
    },
    onError: (err) => {
      toast({
        kind: "error",
        title: "Não foi possível cancelar",
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setFieldError("");
    const email = form.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("Informe um e-mail válido.");
      return;
    }
    if (seatsNearLimit(seats) && seats.used + seats.pending >= seats.max) {
      setFieldError(
        `Seu plano permite até ${seats.max} usuário${seats.max === 1 ? "" : "s"}. Libere uma vaga ou faça upgrade.`
      );
      return;
    }
    await inviteMutation.mutateAsync();
  }

  function closeInvite() {
    if (inviteMutation.isPending) return;
    setOpen(false);
    setFieldError("");
    requestAnimationFrame(() => inviteBtnRef.current?.focus());
  }

  function openInvite() {
    setFieldError("");
    setForm({ email: "", name: "", role: "AGENT" });
    setOpen(true);
  }

  const canInvite = !seatsNearLimit(seats) || seats.used + seats.pending < seats.max;
  const selectedRole = ROLE_OPTIONS.find((r) => r.value === form.role);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Equipe"
        description="Gerencie quem tem acesso à empresa e envie convites com o papel certo."
        actions={
          <button
            ref={inviteBtnRef}
            type="button"
            className="btn-primary"
            onClick={openInvite}
            disabled={!canInvite && seats.max > 0}
            title={
              !canInvite && seats.max > 0
                ? "Limite de usuários do plano atingido"
                : undefined
            }
          >
            <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Convidar
          </button>
        }
      />

      {/* Resumo */}
      {!isLoading && data ? (
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div className="card flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <Users className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Membros
              </p>
              <p className="text-[15px] font-semibold tabular-nums text-ink dark:text-white">
                {seats.used}
                {seats.max > 0 ? (
                  <span className="text-[13px] font-medium text-ink-faint">
                    {" "}
                    / {seats.max}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <Mail className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Convites pendentes
              </p>
              <p className="text-[15px] font-semibold tabular-nums text-ink dark:text-white">
                {seats.pending}
              </p>
            </div>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <Shield className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Vagas disponíveis
              </p>
              <p className="text-[15px] font-semibold tabular-nums text-ink dark:text-white">
                {seats.max > 0
                  ? Math.max(0, seats.max - seats.used - seats.pending)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {seats.max > 0 && seatsNearLimit(seats) ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-900 dark:text-amber-100"
        >
          Seu plano permite até <strong>{seats.max}</strong> usuário
          {seats.max === 1 ? "" : "s"}.{" "}
          {seats.pending > 0
            ? "Cancele convites pendentes ou faça upgrade para convidar mais pessoas."
            : "Faça upgrade do plano para adicionar mais membros."}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : isError ? (
        <div className="card px-5 py-10 text-center">
          <p className="text-[13.5px] text-ink-muted">
            {(error as Error)?.message || "Não foi possível carregar a equipe."}
          </p>
          <button type="button" className="btn-secondary mt-3 h-9" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          {/* Convites pendentes */}
          {pendingInvites.length > 0 ? (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 dark:border-white/[0.06] sm:px-5">
                <div className="min-w-0">
                  <h2 className="text-[13.5px] font-semibold text-ink dark:text-white">
                    Convites pendentes
                  </h2>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    Aguardando a pessoa aceitar o e-mail (válido por 7 dias).
                  </p>
                </div>
                <span className="badge-warning shrink-0">{pendingInvites.length}</span>
              </div>
              <ul className="divide-y divide-line-soft dark:divide-white/[0.05]">
                {pendingInvites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        <Clock className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-ink dark:text-white">
                          {inv.email}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={roleBadgeClass(inv.role)}>
                            {roleLabel[inv.role] || inv.role}
                          </span>
                          <span className="text-[11.5px] text-ink-faint">
                            Expira {formatDate(inv.expiresAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary h-8 shrink-0 self-start px-3 text-[12.5px] sm:self-center"
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(inv.id)}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Membros */}
          <section className="card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line-soft px-4 py-3 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <h2 className="text-[13.5px] font-semibold text-ink dark:text-white">
                  Membros
                </h2>
                <p className="mt-0.5 text-[12px] text-ink-faint">
                  {members.length === 0
                    ? "Ninguém na equipe ainda."
                    : `${members.length} pessoa${members.length === 1 ? "" : "s"} com acesso.`}
                </p>
              </div>
              {members.length > 0 ? (
                <div className="relative w-full sm:max-w-[240px]">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                    strokeWidth={1.75}
                  />
                  <input
                    className="input h-9 pl-8 text-[13px]"
                    placeholder="Buscar por nome ou e-mail…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Buscar membros"
                  />
                </div>
              ) : null}
            </div>

            {members.length === 0 ? (
              <EmptyState
                title="Nenhum membro na equipe"
                description="Convide colegas por e-mail. Eles definem a própria senha ao aceitar."
                icon={<Users className="h-4 w-4" strokeWidth={1.75} />}
                action={
                  <button type="button" className="btn-primary" onClick={openInvite}>
                    <Plus className="h-3.5 w-3.5" /> Convidar membro
                  </button>
                }
              />
            ) : filteredMembers.length === 0 ? (
              <EmptyState
                compact
                title="Nenhum resultado"
                description="Tente outro nome, e-mail ou papel."
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="table-wrap hidden md:block">
                  <table className="table min-w-[720px]">
                    <thead>
                      <tr>
                        <th>Pessoa</th>
                        <th>Papel</th>
                        <th>Último acesso</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <UserAvatar user={m.user} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-ink dark:text-gray-100">
                                  {m.user.name}
                                </p>
                                <p className="truncate text-[12px] text-ink-faint">
                                  {m.user.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={roleBadgeClass(m.role)}>
                              {roleLabel[m.role] || m.role}
                            </span>
                          </td>
                          <td className="text-ink-muted">
                            {m.user.lastLoginAt
                              ? formatDate(m.user.lastLoginAt)
                              : "Nunca acessou"}
                          </td>
                          <td>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 text-[12.5px] font-medium",
                                m.isActive
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-ink-muted"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  m.isActive ? "bg-emerald-500" : "bg-ink-faint/50"
                                )}
                              />
                              {m.isActive ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <ul className="divide-y divide-line-soft dark:divide-white/[0.05] md:hidden">
                  {filteredMembers.map((m) => (
                    <li key={m.id} className="flex items-start gap-3 px-4 py-3.5">
                      <UserAvatar user={m.user} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13.5px] font-medium text-ink dark:text-white">
                            {m.user.name}
                          </p>
                          <span className={roleBadgeClass(m.role)}>
                            {roleLabel[m.role] || m.role}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-ink-faint">
                          {m.user.email}
                        </p>
                        <p className="mt-1.5 text-[11.5px] text-ink-faint">
                          {m.isActive ? "Ativo" : "Inativo"}
                          {" · "}
                          {m.user.lastLoginAt
                            ? `Acesso ${formatDate(m.user.lastLoginAt)}`
                            : "Nunca acessou"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {/* Convidar membro */}
      <Modal
        open={open}
        onClose={closeInvite}
        title="Convidar membro"
        description="A pessoa recebe um e-mail com link para definir a senha e entrar."
        size="md"
        variant="contextual"
        initialFocus="panel"
        preventClose={inviteMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              onClick={closeInvite}
              disabled={inviteMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-invite-form"
              className="btn-primary h-9 px-4 sm:min-w-[9rem]"
              disabled={inviteMutation.isPending || !form.email.trim()}
            >
              {inviteMutation.isPending ? "Enviando…" : "Enviar convite"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-invite-form" onSubmit={onInvite} className="space-y-4">
          <FormSection title="Quem convidar" surface>
            <div className="space-y-3">
              <FormField label="E-mail" htmlFor="invite-email" required>
                <input
                  id="invite-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="colega@empresa.com"
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    if (fieldError) setFieldError("");
                  }}
                  required
                />
              </FormField>
              <FormField
                label="Nome (opcional)"
                htmlFor="invite-name"
                hint="Se vazio, usamos a parte do e-mail. A pessoa pode ajustar ao aceitar."
              >
                <input
                  id="invite-name"
                  className="input"
                  type="text"
                  autoComplete="name"
                  placeholder="Ex.: Ana Souza"
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Papel na empresa" surface>
            <p className="mb-2.5 text-[12px] leading-relaxed text-ink-faint">
              Define o que a pessoa poderá ver e fazer no painel.
            </p>
            <div className="grid gap-2" role="radiogroup" aria-label="Papel">
              {ROLE_OPTIONS.map((r) => {
                const selected = form.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setForm({ ...form, role: r.value })}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                      selected
                        ? "border-brand-500/[0.35] bg-brand-500/[0.06] shadow-[0_0_0_1px_rgba(79,70,229,0.08)] dark:border-brand-400/[0.35] dark:bg-brand-500/10"
                        : "border-black/[0.06] bg-white hover:border-black/[0.1] hover:bg-black/[0.015] dark:border-white/[0.08] dark:bg-[#12141A] dark:hover:bg-white/[0.03]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-brand-500 bg-brand-500 dark:border-brand-400 dark:bg-brand-400"
                          : "border-black/[0.15] dark:border-white/20"
                      )}
                      aria-hidden
                    >
                      {selected ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-[#0b0c10]" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink dark:text-white">
                        {r.label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">
                        {r.help}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedRole ? (
              <p className="mt-2.5 text-[11.5px] text-ink-faint">
                Selecionado: <strong className="font-medium text-ink-muted dark:text-gray-300">{selectedRole.label}</strong>
              </p>
            ) : null}
          </FormSection>

          {fieldError ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-300"
            >
              {fieldError}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
