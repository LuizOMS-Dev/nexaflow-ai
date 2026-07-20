"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Search, Shield, Users } from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState, Select, Spinner, useToast } from "@/components/ui";
import { AdminPageHeader } from "../admin-page-header";

type MembershipRow = {
  id: string;
  role: string;
  isActive: boolean;
  tenant: { id: string; name: string; slug: string };
};

type AdminUser = {
  id: string;
  email: string;
  name: string;
  platformRole?: string | null;
  status?: string | null;
  isActive?: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  memberships?: MembershipRow[];
};

type TabId = "companies" | "platform";

const tenantRoleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  SALES: "Comercial",
  READONLY: "Somente leitura",
};

const platformRoleLabel: Record<string, string> = {
  SUPERADMIN: "Superadministrador",
};

const userStatusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  INVITED: "Convidado",
  SUSPENDED: "Suspenso",
  DISABLED: "Bloqueado",
  PENDING_VERIFICATION: "Pendente",
};

function isPlatformAdmin(u: AdminUser): boolean {
  return Boolean(u.platformRole && u.platformRole === "SUPERADMIN");
}

function hasCompanyMembership(u: AdminUser): boolean {
  return (u.memberships?.length ?? 0) > 0;
}

function formatLastAccess(value?: string | null): string {
  if (!value) return "Nunca acessou";
  return formatDate(value);
}

function formatCreated(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

export default function AdminUsersPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("companies");
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/admin/users"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: (p: { id: string; status: "ACTIVE" | "SUSPENDED" | "DISABLED" }) =>
      api(`/admin/users/${p.id}/status`, {
        method: "PATCH",
        json: { status: p.status },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ kind: "success", title: "Status do usuário atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível atualizar", description: e.message }),
  });

  const allUsers = useMemo(() => {
    return (data || []).filter(
      (u) =>
        !u.email.endsWith("@test.local") &&
        !u.email.endsWith("@test.nexaflow.local")
    );
  }, [data]);

  /** Usuários com membership em empresas clientes (role global independente) */
  const companyUsers = useMemo(
    () => allUsers.filter(hasCompanyMembership),
    [allUsers]
  );

  /** Contas com papel global de plataforma (ex.: SUPERADMIN) */
  const platformAdmins = useMemo(
    () => allUsers.filter(isPlatformAdmin),
    [allUsers]
  );

  const tenantOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of companyUsers) {
      for (const m of u.memberships || []) {
        map.set(m.tenant.id, m.tenant.name);
      }
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [companyUsers]);

  const filteredCompanyUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companyUsers.filter((u) => {
      const memberships = u.memberships || [];
      if (tenantFilter !== "ALL") {
        if (!memberships.some((m) => m.tenant.id === tenantFilter)) return false;
      }
      if (roleFilter !== "ALL") {
        if (!memberships.some((m) => m.role === roleFilter)) return false;
      }
      if (statusFilter === "ACTIVE" && u.isActive === false) return false;
      if (statusFilter === "INACTIVE" && u.isActive !== false) return false;

      if (!q) return true;
      const hay = [
        u.name,
        u.email,
        ...memberships.map((m) => m.tenant.name),
        ...memberships.map((m) => tenantRoleLabel[m.role] || m.role),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [companyUsers, search, tenantFilter, roleFilter, statusFilter]);

  const filteredPlatformAdmins = useMemo(() => {
    const q = search.trim().toLowerCase();
    return platformAdmins.filter((u) => {
      if (statusFilter === "ACTIVE" && u.isActive === false) return false;
      if (statusFilter === "INACTIVE" && u.isActive !== false) return false;
      if (!q) return true;
      const hay = [u.name, u.email, platformRoleLabel[u.platformRole || ""] || ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [platformAdmins, search, statusFilter]);

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <EmptyState title="Não foi possível carregar os usuários. Tente novamente." />
    );
  }

  const listCount =
    tab === "companies" ? filteredCompanyUsers.length : filteredPlatformAdmins.length;

  return (
    <div>
      <AdminPageHeader
        title="Usuários"
      />

      {/* Tabs conceituais: membership (tenant) × platformRole (global) */}
      <div className="mb-4 flex gap-0.5 overflow-x-auto rounded-xl border border-black/[0.05] bg-black/[0.02] p-1 dark:border-white/[0.07] dark:bg-white/[0.035]">
        <button
          type="button"
          onClick={() => {
            setTab("companies");
            setSearch("");
            setTenantFilter("ALL");
            setRoleFilter("ALL");
            setStatusFilter("ALL");
          }}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-medium transition-colors",
            tab === "companies"
              ? "bg-white text-ink shadow-sm ring-1 ring-black/[0.04] dark:bg-[#1c212c] dark:text-white dark:ring-white/[0.06]"
              : "text-ink-muted hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
          )}
        >
          <Building2 className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
          Usuários de empresas
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              tab === "companies"
                ? "bg-brand-500/[0.12] text-brand-700 dark:text-brand-300"
                : "bg-black/[0.05] text-ink-faint dark:bg-white/[0.06]"
            )}
          >
            {companyUsers.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("platform");
            setSearch("");
            setTenantFilter("ALL");
            setRoleFilter("ALL");
            setStatusFilter("ALL");
          }}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-medium transition-colors",
            tab === "platform"
              ? "bg-white text-ink shadow-sm ring-1 ring-black/[0.04] dark:bg-[#1c212c] dark:text-white dark:ring-white/[0.06]"
              : "text-ink-muted hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
          )}
        >
          <Shield className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
          Administração da plataforma
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              tab === "platform"
                ? "bg-violet-500/[0.12] text-violet-700 dark:text-violet-300"
                : "bg-black/[0.05] text-ink-faint dark:bg-white/[0.06]"
            )}
          >
            {platformAdmins.length}
          </span>
        </button>
      </div>

      {/* Filtros contextuais */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            className="input h-9 pl-8 text-sm"
            placeholder={
              tab === "companies"
                ? "Buscar nome, e-mail ou empresa…"
                : "Buscar administrador…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === "companies" ? (
          <>
            <Select
              className="w-auto min-w-[10rem]"
              size="sm"
              value={tenantFilter}
              onChange={setTenantFilter}
              options={[
                { value: "ALL", label: "Todas as empresas" },
                ...tenantOptions,
              ]}
              aria-label="Empresa"
            />
            <Select
              className="w-auto min-w-[9rem]"
              size="sm"
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "ALL", label: "Todos os papéis" },
                { value: "ADMIN", label: "Administrador" },
                { value: "SUPERVISOR", label: "Supervisor" },
                { value: "AGENT", label: "Atendente" },
                { value: "SALES", label: "Comercial" },
                { value: "READONLY", label: "Somente leitura" },
              ]}
              aria-label="Papel na empresa"
            />
          </>
        ) : null}

        <Select
          className="w-auto min-w-[8.5rem]"
          size="sm"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "ALL", label: "Todos os status" },
            { value: "ACTIVE", label: "Ativo" },
            { value: "INACTIVE", label: "Inativo" },
          ]}
          aria-label="Status"
        />

        <span className="text-[12px] text-ink-faint">
          {listCount} resultado{listCount === 1 ? "" : "s"}
        </span>
      </div>

      {tab === "companies" ? (
        <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
          Papel <strong className="font-medium text-ink-muted">Administrador</strong> aqui
          significa administrador <em>da empresa cliente</em> — não é Superadministrador da
          NexaFlow Platform.
        </p>
      ) : (
        <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
          Contas com <strong className="font-medium text-ink-muted">papel global</strong> da
          plataforma. Independente de membership em empresas.
        </p>
      )}

      {/* ─── Aba: Usuários de empresas ─── */}
      {tab === "companies" &&
        (filteredCompanyUsers.length === 0 ? (
          <EmptyState
            compact
            icon={<Users className="h-5 w-5" strokeWidth={1.5} />}
            title="Nenhum usuário de empresa"
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/[0.05] dark:border-white/[0.07]">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line-soft bg-black/[0.015] text-[11px] font-medium uppercase tracking-wide text-ink-faint dark:border-white/[0.06] dark:bg-white/[0.025]">
                  <th className="px-3.5 py-2.5">Usuário</th>
                  <th className="px-3.5 py-2.5">Empresa(s)</th>
                  <th className="hidden px-3.5 py-2.5 md:table-cell">Papel na empresa</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="hidden px-3.5 py-2.5 lg:table-cell">Último acesso</th>
                  <th className="hidden px-3.5 py-2.5 sm:table-cell">Criado</th>
                  <th className="px-3.5 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft dark:divide-white/[0.05]">
                {filteredCompanyUsers.map((u) => {
                  const memberships = u.memberships || [];
                  const roles = [
                    ...new Set(
                      memberships.map((m) => tenantRoleLabel[m.role] || m.role)
                    ),
                  ];
                  const active = u.isActive !== false;
                  return (
                    <tr key={u.id} className="text-[13px] align-top">
                      <td className="px-3.5 py-3">
                        <p className="font-medium text-ink dark:text-white">{u.name}</p>
                        <p className="text-[11px] text-ink-faint">{u.email}</p>
                        {isPlatformAdmin(u) ? (
                          <p className="mt-1 text-[10px] font-medium text-violet-600 dark:text-violet-300">
                            Também é admin da plataforma
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-[200px] px-3.5 py-3">
                        <div className="space-y-0.5">
                          {memberships.map((m) => (
                            <p
                              key={m.id}
                              className="truncate text-ink-secondary dark:text-gray-300"
                              title={m.tenant.name}
                            >
                              {m.tenant.name}
                            </p>
                          ))}
                          {memberships.length > 1 ? (
                            <p className="text-[10px] text-ink-faint">
                              {memberships.length} empresas
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden px-3.5 py-3 text-ink-muted md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {roles.map((r) => (
                            <span
                              key={r}
                              className="rounded-md border border-black/[0.05] bg-black/[0.02] px-1.5 py-0.5 text-[11px] dark:border-white/[0.08] dark:bg-white/[0.04]"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          className={cn(
                            "text-[12px] font-medium",
                            active
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-ink-faint"
                          )}
                        >
                          {active
                            ? userStatusLabel[u.status || "ACTIVE"] || "Ativo"
                            : "Inativo"}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3.5 py-3 text-ink-muted lg:table-cell">
                        {formatLastAccess(u.lastLoginAt)}
                      </td>
                      <td className="hidden whitespace-nowrap px-3.5 py-3 text-ink-faint sm:table-cell">
                        {formatCreated(u.createdAt)}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {u.status === "ACTIVE" || (!u.status && active) ? (
                            <>
                              <button
                                type="button"
                                className="text-[11px] font-medium text-amber-700 hover:underline dark:text-amber-300"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({ id: u.id, status: "SUSPENDED" })
                                }
                              >
                                Suspender
                              </button>
                              <button
                                type="button"
                                className="text-[11px] font-medium text-rose-700 hover:underline dark:text-rose-300"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({ id: u.id, status: "DISABLED" })
                                }
                              >
                                Bloquear
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-300"
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({ id: u.id, status: "ACTIVE" })
                              }
                            >
                              Reativar
                            </button>
                          )}
                          {memberships[0] ? (
                            <Link
                              href={`/admin/tenants/${memberships[0].tenant.id}?tab=users`}
                              className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                            >
                              Empresa
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {/* ─── Aba: Administração da plataforma ─── */}
      {tab === "platform" &&
        (filteredPlatformAdmins.length === 0 ? (
          <EmptyState
            compact
            icon={<Shield className="h-5 w-5" strokeWidth={1.5} />}
            title="Nenhum administrador da plataforma"
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/[0.05] dark:border-white/[0.07]">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-line-soft bg-black/[0.015] text-[11px] font-medium uppercase tracking-wide text-ink-faint dark:border-white/[0.06] dark:bg-white/[0.025]">
                  <th className="px-3.5 py-2.5">Administrador</th>
                  <th className="px-3.5 py-2.5">Papel global</th>
                  <th className="px-3.5 py-2.5">MFA</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="hidden px-3.5 py-2.5 sm:table-cell">Último acesso</th>
                  <th className="hidden px-3.5 py-2.5 md:table-cell">Criado</th>
                  <th className="px-3.5 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft dark:divide-white/[0.05]">
                {filteredPlatformAdmins.map((u) => {
                  const active = u.isActive !== false;
                  const mfaOn = Boolean(u.twoFactorEnabled);
                  const hasMembership = hasCompanyMembership(u);
                  return (
                    <tr key={u.id} className="text-[13px] align-top">
                      <td className="px-3.5 py-3">
                        <p className="font-medium text-ink dark:text-white">{u.name}</p>
                        <p className="text-[11px] text-ink-faint">{u.email}</p>
                        {hasMembership ? (
                          <p className="mt-1 text-[10px] text-ink-faint">
                            Também possui vínculo em empresa cliente
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="badge-brand text-[11px]">
                          {platformRoleLabel[u.platformRole || ""] ||
                            u.platformRole ||
                            "—"}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[12px] font-medium",
                            mfaOn
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {mfaOn ? "Ativo" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          className={cn(
                            "text-[12px] font-medium",
                            active
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-ink-faint"
                          )}
                        >
                          {active
                            ? userStatusLabel[u.status || "ACTIVE"] || "Ativo"
                            : "Inativo"}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3.5 py-3 text-ink-muted sm:table-cell">
                        {formatLastAccess(u.lastLoginAt)}
                      </td>
                      <td className="hidden whitespace-nowrap px-3.5 py-3 text-ink-faint md:table-cell">
                        {formatCreated(u.createdAt)}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <Link
                          href="/app/account/security"
                          className="text-[12px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Segurança
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
