"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  RefreshCw,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui";
import {
  AdminErrorState,
  AdminFilterBar,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSearchInput,
  AdminSection,
  AdminSelectFilter,
  MetricCard,
  MetricGrid,
  StatusBadge,
  statusToTone,
} from "@/components/admin";

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

function resolveUserStatus(u: AdminUser): { label: string; code: string } {
  const active = u.isActive !== false;
  if (!active) {
    if (u.status === "DISABLED") return { label: "Bloqueado", code: "DISABLED" };
    if (u.status === "SUSPENDED") return { label: "Suspenso", code: "SUSPENDED" };
    return { label: "Inativo", code: "DISABLED" };
  }
  const code = u.status || "ACTIVE";
  return { label: userStatusLabel[code] || "Ativo", code };
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

  const { data, isLoading, error, refetch, isFetching } = useQuery({
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

  const companyUsers = useMemo(
    () => allUsers.filter(hasCompanyMembership),
    [allUsers]
  );

  const platformAdmins = useMemo(
    () => allUsers.filter(isPlatformAdmin),
    [allUsers]
  );

  const metrics = useMemo(() => {
    const activeCompany = companyUsers.filter((u) => u.isActive !== false).length;
    const mfaOn = platformAdmins.filter((u) => u.twoFactorEnabled).length;
    return {
      companyUsers: companyUsers.length,
      platformAdmins: platformAdmins.length,
      activeCompany,
      mfaOn,
    };
  }, [companyUsers, platformAdmins]);

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

  if (isLoading) return <AdminPageSkeleton metrics={3} />;

  if (error) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Usuários" />
        <AdminErrorState
          title="Não foi possível carregar os usuários"
          description="Tente novamente em instantes."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const listCount =
    tab === "companies" ? filteredCompanyUsers.length : filteredPlatformAdmins.length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Usuários"
        actions={
          <button
            type="button"
            className="admin-btn-secondary h-8 px-2.5 text-[12px]"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Atualizar lista"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      <MetricGrid cols={3}>
        <MetricCard
          label="Empresas"
          value={metrics.companyUsers}
          hint={`${metrics.activeCompany} ativos`}
          icon={<Building2 className="h-4 w-4" />}
          tone="brand"
          compact
        />
        <MetricCard
          label="Superadmins"
          value={metrics.platformAdmins}
          icon={<Shield className="h-4 w-4" />}
          tone="violet"
          compact
        />
        <MetricCard
          label="MFA"
          value={metrics.mfaOn}
          hint={
            metrics.platformAdmins
              ? `${metrics.mfaOn}/${metrics.platformAdmins} com 2FA`
              : undefined
          }
          icon={<ShieldCheck className="h-4 w-4" />}
          tone={
            metrics.platformAdmins > 0 && metrics.mfaOn < metrics.platformAdmins
              ? "warning"
              : "success"
          }
          compact
        />
      </MetricGrid>

      {/* Tabs: membership (tenant) × platformRole (global) */}
      <div className="admin-tabs" role="tablist" aria-label="Escopo de usuários">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "companies"}
          data-active={tab === "companies" ? "true" : "false"}
          className="admin-tab"
          onClick={() => {
            setTab("companies");
            setSearch("");
            setTenantFilter("ALL");
            setRoleFilter("ALL");
            setStatusFilter("ALL");
          }}
        >
          <Building2 className="mr-1.5 h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
          Usuários de empresas
          <span
            className={cn(
              "ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              tab === "companies"
                ? "bg-violet-500/15 text-violet-200"
                : "bg-white/[0.05] text-gray-500"
            )}
          >
            {companyUsers.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "platform"}
          data-active={tab === "platform" ? "true" : "false"}
          className="admin-tab"
          onClick={() => {
            setTab("platform");
            setSearch("");
            setTenantFilter("ALL");
            setRoleFilter("ALL");
            setStatusFilter("ALL");
          }}
        >
          <Shield className="mr-1.5 h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
          Administração da plataforma
          <span
            className={cn(
              "ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              tab === "platform"
                ? "bg-violet-500/15 text-violet-200"
                : "bg-white/[0.05] text-gray-500"
            )}
          >
            {platformAdmins.length}
          </span>
        </button>
      </div>

      <AdminFilterBar>
        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder={
            tab === "companies"
              ? "Buscar nome, e-mail ou empresa…"
              : "Buscar administrador…"
          }
          id="admin-users-search"
        />

        {tab === "companies" ? (
          <>
            <AdminSelectFilter
              label="Empresa"
              value={tenantFilter}
              onChange={setTenantFilter}
              options={[
                { value: "ALL", label: "Todas as empresas" },
                ...tenantOptions,
              ]}
            />
            <AdminSelectFilter
              label="Papel"
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
            />
          </>
        ) : null}

        <AdminSelectFilter
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "ALL", label: "Todos os status" },
            { value: "ACTIVE", label: "Ativo" },
            { value: "INACTIVE", label: "Inativo" },
          ]}
        />

        <span className="text-[12px] text-gray-500 sm:ml-auto">
          {listCount} resultado{listCount === 1 ? "" : "s"}
        </span>
      </AdminFilterBar>

      {tab === "companies" && (
        <AdminSection flush>
          {filteredCompanyUsers.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400">
                <Users className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <p className="text-[13.5px] font-semibold text-white/85">Nenhum usuário de empresa</p>
              <p className="mt-1 max-w-sm text-[12.5px] text-gray-500">
                Ajuste os filtros ou aguarde novos cadastros em empresas clientes.
              </p>
            </div>
          ) : (
            <div className="admin-table-wrap overflow-x-auto">
              <table className="admin-table w-full min-w-[760px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Usuário
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Empresa(s)
                    </th>
                    <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 md:table-cell">
                      Papel na empresa
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Status
                    </th>
                    <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 lg:table-cell">
                      Último acesso
                    </th>
                    <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 sm:table-cell">
                      Criado
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanyUsers.map((u) => {
                    const memberships = u.memberships || [];
                    const roles = [
                      ...new Set(
                        memberships.map((m) => tenantRoleLabel[m.role] || m.role)
                      ),
                    ];
                    const active = u.isActive !== false;
                    const st = resolveUserStatus(u);
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-white/[0.04] align-top transition-colors last:border-0 hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{u.name}</p>
                          <p className="text-[11.5px] text-gray-500">{u.email}</p>
                          {isPlatformAdmin(u) ? (
                            <p className="mt-1 text-[10px] font-medium text-violet-300/90">
                              Também é admin da plataforma
                            </p>
                          ) : null}
                        </td>
                        <td className="max-w-[200px] px-4 py-3">
                          <div className="space-y-0.5">
                            {memberships.map((m) => (
                              <p
                                key={m.id}
                                className="truncate text-gray-300"
                                title={m.tenant.name}
                              >
                                {m.tenant.name}
                              </p>
                            ))}
                            {memberships.length > 1 ? (
                              <p className="text-[10px] text-gray-600">
                                {memberships.length} empresas
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {roles.map((r) => (
                              <StatusBadge key={r} tone="neutral">
                                {r}
                              </StatusBadge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={statusToTone(st.code)} dot>
                            {st.label}
                          </StatusBadge>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-gray-400 lg:table-cell">
                          {formatLastAccess(u.lastLoginAt)}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 sm:table-cell">
                          {formatCreated(u.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {u.status === "ACTIVE" || (!u.status && active) ? (
                              <>
                                <button
                                  type="button"
                                  className="admin-btn-ghost h-8 px-2.5 text-[12px] text-amber-200/90 hover:text-amber-100"
                                  disabled={statusMutation.isPending}
                                  onClick={() =>
                                    statusMutation.mutate({ id: u.id, status: "SUSPENDED" })
                                  }
                                >
                                  Suspender
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn-ghost h-8 px-2.5 text-[12px] text-red-300/90 hover:text-red-200"
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
                                className="admin-btn-ghost h-8 px-2.5 text-[12px] text-emerald-300/90 hover:text-emerald-200"
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
                                className="admin-btn-ghost h-8 px-2.5 text-[12px] text-violet-300/90 hover:text-violet-200"
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
          )}
        </AdminSection>
      )}

      {tab === "platform" && (
        <AdminSection flush>
          {filteredPlatformAdmins.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400">
                <Shield className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <p className="text-[13.5px] font-semibold text-white/85">
                Nenhum administrador da plataforma
              </p>
              <p className="mt-1 max-w-sm text-[12.5px] text-gray-500">
                Não há contas com papel global SUPERADMIN neste filtro.
              </p>
            </div>
          ) : (
            <div className="admin-table-wrap overflow-x-auto">
              <table className="admin-table w-full min-w-[700px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Administrador
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Papel global
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      MFA
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Status
                    </th>
                    <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 sm:table-cell">
                      Último acesso
                    </th>
                    <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 md:table-cell">
                      Criado
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlatformAdmins.map((u) => {
                    const st = resolveUserStatus(u);
                    const mfaOn = Boolean(u.twoFactorEnabled);
                    const hasMembership = hasCompanyMembership(u);
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-white/[0.04] align-top transition-colors last:border-0 hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{u.name}</p>
                          <p className="text-[11.5px] text-gray-500">{u.email}</p>
                          {hasMembership ? (
                            <p className="mt-1 text-[10px] text-gray-600">
                              Também possui vínculo em empresa cliente
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone="violet">
                            {platformRoleLabel[u.platformRole || ""] ||
                              u.platformRole ||
                              "—"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={mfaOn ? "success" : "warning"} dot>
                            {mfaOn ? "Ativo" : "Pendente"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={statusToTone(st.code)} dot>
                            {st.label}
                          </StatusBadge>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-gray-400 sm:table-cell">
                          {formatLastAccess(u.lastLoginAt)}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 md:table-cell">
                          {formatCreated(u.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href="/app/account/security"
                            className="admin-btn-ghost h-8 px-2.5 text-[12px] text-violet-300/90 hover:text-violet-200"
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
          )}
        </AdminSection>
      )}
    </div>
  );
}
