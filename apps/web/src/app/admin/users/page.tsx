"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Building2,
  KeyRound,
  Plus,
  RefreshCw,
  Shield,
  ShieldOff,
  UserX,
  Users,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatDate } from "@/lib/utils";
import { Modal, useToast } from "@/components/ui";
import { ActionMenu, Popover } from "@/components/ui-menu";
import { CriticalActionDialog } from "@/components/admin/critical-action-dialog";
import { NewUserDialog } from "@/features/platform-admin/new-user-dialog";
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

type UsersListResponse = {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type UsersKpis = {
  totalUsers: number;
  activeUsers: number;
  superadmins: number;
  usersWithMfa: number;
  activeMemberships: number;
  tenantsWithUsers: number;
  platformActive?: number;
  platformWithMfa?: number;
  platformActiveSessions?: number;
};

type TenantOption = { id: string; name: string };

function UserDetailDialog({
  userId,
  onClose,
  onAction,
}: {
  userId: string | null;
  onClose: () => void;
  onAction: (
    type: "suspend" | "block" | "reactivate" | "revoke" | "reset-mfa",
    user: AdminUser
  ) => void;
}) {
  const q = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => api<AdminUser & { activeSessions?: number }>("/admin/users/" + userId),
    enabled: Boolean(userId),
  });
  const u = q.data;
  return (
    <Modal
      open={Boolean(userId)}
      onClose={onClose}
      title="Detalhe do usuário"
      description="Identidade global, segurança e vínculos com empresas."
      size="lg"
    >
      {q.isLoading || !u ? (
        <p className="text-[13px] text-gray-500">Carregando…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">Identidade</p>
            <p className="mt-1 text-[14px] font-medium text-white">{u.name}</p>
            <p className="text-[12.5px] text-gray-400">{u.email}</p>
            <p className="mt-1 text-[12px] text-gray-500">
              Status global: {resolveUserStatus(u).label}
              {u.platformRole === "SUPERADMIN" ? " · Superadministrador" : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">Segurança</p>
            <p className="mt-1 text-[12.5px] text-gray-300">
              MFA {u.twoFactorEnabled ? "ativo" : "não configurado"} · sessões ativas{" "}
              {u.activeSessions ?? "—"} · último acesso {formatLastAccess(u.lastLoginAt)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="admin-btn-secondary h-8 px-2.5 text-[12px]" onClick={() => onAction("revoke", u)}>
                Encerrar sessões
              </button>
              <button
                type="button"
                className="admin-btn-secondary h-8 px-2.5 text-[12px]"
                disabled={!u.twoFactorEnabled}
                onClick={() => onAction("reset-mfa", u)}
              >
                Redefinir MFA
              </button>
              {u.status === "ACTIVE" ? (
                <button type="button" className="admin-btn-secondary h-8 px-2.5 text-[12px]" onClick={() => onAction("suspend", u)}>
                  Suspender conta globalmente
                </button>
              ) : (
                <button type="button" className="admin-btn-secondary h-8 px-2.5 text-[12px]" onClick={() => onAction("reactivate", u)}>
                  Reativar conta
                </button>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">Empresas vinculadas</p>
            {(u.memberships || []).length === 0 ? (
              <p className="mt-1 text-[12.5px] text-gray-500">Nenhum vínculo com empresa.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {(u.memberships || []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate text-gray-200">
                      {m.tenant.name} · {tenantRoleLabel[m.role] || m.role} ·{" "}
                      {m.isActive ? "acesso ativo" : "suspenso nesta empresa"}
                    </span>
                    <Link href={`/admin/tenants/${m.tenant.id}?tab=users`} className="shrink-0 text-violet-300">
                      Gerenciar
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminUsersPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("companies");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    type: "suspend" | "block" | "reactivate" | "revoke" | "reset-mfa";
    user: AdminUser;
  } | null>(null);
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const statsQuery = useQuery({
    queryKey: ["admin-users-stats"],
    queryFn: () => api<UsersKpis>("/admin/users/stats"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 30_000,
  });

  const tenantsQuery = useQuery({
    queryKey: ["admin-users-tenant-options"],
    queryFn: () =>
      api<{ items: TenantOption[] }>("/admin/tenants?page=1&limit=100"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 60_000,
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [
      "admin-users",
      tab,
      debouncedSearch,
      tenantFilter,
      roleFilter,
      statusFilter,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("scope", tab === "platform" ? "platform" : "companies");
      params.set("page", String(page));
      params.set("limit", "30");
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (tab === "companies" && roleFilter !== "ALL") params.set("role", roleFilter);
      if (tab === "companies" && tenantFilter !== "ALL") params.set("tenantId", tenantFilter);
      return api<UsersListResponse>(`/admin/users?${params.toString()}`);
    },
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const statusMutation = useMutation({
    mutationFn: (p: { id: string; status: "ACTIVE" | "SUSPENDED" | "DISABLED" }) =>
      api(`/admin/users/${p.id}/status`, {
        method: "PATCH",
        json: { status: p.status },
      }),
    onSuccess: () => {
      setPending(null);
      setConfirmCheck(false);
      setConfirmText("");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
      toast({ kind: "success", title: "Status da conta atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível atualizar", description: e.message }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/users/${id}/revoke-sessions`, { method: "POST" }),
    onSuccess: () => {
      setPending(null);
      toast({ kind: "success", title: "Sessões encerradas" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível encerrar sessões", description: e.message }),
  });

  const resetMfaMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/users/${id}/reset-mfa`, { method: "POST" }),
    onSuccess: () => {
      setPending(null);
      setConfirmCheck(false);
      setConfirmText("");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ kind: "success", title: "MFA redefinido" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível redefinir o MFA", description: e.message }),
  });

  function runPending() {
    if (!pending) return;
    if (pending.type === "suspend") statusMutation.mutate({ id: pending.user.id, status: "SUSPENDED" });
    if (pending.type === "block") statusMutation.mutate({ id: pending.user.id, status: "DISABLED" });
    if (pending.type === "reactivate") statusMutation.mutate({ id: pending.user.id, status: "ACTIVE" });
    if (pending.type === "revoke") revokeMutation.mutate(pending.user.id);
    if (pending.type === "reset-mfa") resetMfaMutation.mutate(pending.user.id);
  }

  const pendingBusy =
    statusMutation.isPending || revokeMutation.isPending || resetMfaMutation.isPending;

  const listedUsers = data?.items || [];
  const stats = statsQuery.data;
  const tenantOptions = useMemo(
    () =>
      (tenantsQuery.data?.items || [])
        .map((t) => ({ value: t.id, label: t.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [tenantsQuery.data]
  );
  const filteredCompanyUsers = tab === "companies" ? listedUsers : [];
  const filteredPlatformAdmins = tab === "platform" ? listedUsers : [];
  const metrics = {
    companyUsers: stats?.totalUsers ?? 0,
    tenantsWithUsers: stats?.tenantsWithUsers ?? 0,
    platformAdmins: stats?.superadmins ?? 0,
    activeCompany: stats?.activeUsers ?? 0,
    mfaOn: stats?.usersWithMfa ?? 0,
    activeMemberships: stats?.activeMemberships ?? 0,
  };

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

  const listCount = data?.total ?? listedUsers.length;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Usuários"
        actions={
          <div className="flex items-center gap-2">
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
            <button
              type="button"
              className="admin-btn-primary h-8 px-2.5 text-[12px]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Novo usuário
            </button>
          </div>
        }
      />

      <MetricGrid cols={4}>
        {tab === "companies" ? (
          <>
            <MetricCard label="Usuários únicos" value={metrics.companyUsers} icon={<Users className="h-4 w-4" />} tone="brand" compact />
            <MetricCard label="Usuários ativos" value={metrics.activeCompany} compact />
            <MetricCard label="Com MFA" value={metrics.mfaOn} compact />
            <MetricCard label="Memberships ativas" value={metrics.activeMemberships} compact />
          </>
        ) : (
          <>
            <MetricCard label="Superadmins" value={metrics.platformAdmins} icon={<Shield className="h-4 w-4" />} tone="violet" compact />
            <MetricCard label="Ativos" value={stats?.platformActive ?? 0} compact />
            <MetricCard label="Com MFA" value={stats?.platformWithMfa ?? 0} compact />
            <MetricCard label="Sessões ativas" value={stats?.platformActiveSessions ?? 0} compact />
          </>
        )}
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
            setPage(1);
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
            {stats?.totalUsers ?? listedUsers.length}
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
            setPage(1);
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
            {stats?.superadmins ?? 0}
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
              onChange={(v) => {
                setTenantFilter(v);
                setPage(1);
              }}
              options={[
                { value: "ALL", label: "Todas as empresas" },
                ...tenantOptions,
              ]}
            />
            <AdminSelectFilter
              label="Papel"
              value={roleFilter}
              onChange={(v) => {
                setRoleFilter(v);
                setPage(1);
              }}
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
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: "ALL", label: "Todos os status" },
            { value: "ACTIVE", label: "Ativo" },
            { value: "SUSPENDED", label: "Suspenso" },
            { value: "DISABLED", label: "Bloqueado" },
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
                    <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 xl:table-cell">
                      MFA
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
                        <td className="max-w-[220px] px-4 py-3">
                          {memberships.length === 0 ? (
                            <span className="text-gray-600">Sem vínculo</span>
                          ) : memberships.length === 1 ? (
                            <p className="truncate text-gray-300" title={memberships[0].tenant.name}>
                              {memberships[0].tenant.name}
                            </p>
                          ) : (
                            <Popover
                              align="left"
                              minWidth={220}
                              trigger={
                                <button
                                  type="button"
                                  className="truncate text-left text-gray-200 hover:text-white"
                                >
                                  {memberships[0].tenant.name}
                                  <span className="ml-1 text-[11px] text-violet-300">
                                    +{memberships.length - 1} empresa
                                    {memberships.length - 1 === 1 ? "" : "s"}
                                  </span>
                                </button>
                              }
                            >
                              <div className="space-y-1 p-1">
                                {memberships.map((m) => (
                                  <Link
                                    key={m.id}
                                    href={`/admin/tenants/${m.tenant.id}?tab=users`}
                                    className="block rounded-lg px-2 py-1.5 text-[12.5px] text-gray-200 hover:bg-white/[0.05]"
                                  >
                                    <span className="block truncate font-medium">{m.tenant.name}</span>
                                    <span className="text-[11px] text-gray-500">
                                      {tenantRoleLabel[m.role] || m.role}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </Popover>
                          )}
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
                        <td className="hidden px-4 py-3 xl:table-cell">
                          <StatusBadge tone={u.twoFactorEnabled ? "success" : "neutral"} dot>
                            {u.twoFactorEnabled ? "Ativo" : "Não"}
                          </StatusBadge>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-gray-400 lg:table-cell">
                          {formatLastAccess(u.lastLoginAt)}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 sm:table-cell">
                          {formatCreated(u.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ActionMenu
                            aria-label={`Ações para ${u.name}`}
                            items={[
                              {
                                label: "Ver detalhes",
                                onClick: () => setDetailUserId(u.id),
                              },
                              ...(memberships[0]
                                ? [
                                    {
                                      label: "Ver empresa",
                                      icon: Building2,
                                      onClick: () => {
                                        window.location.href = `/admin/tenants/${memberships[0].tenant.id}?tab=users`;
                                      },
                                    },
                                  ]
                                : []),
                              ...(u.status === "ACTIVE" || (!u.status && active)
                                ? [
                                    {
                                      label: "Suspender conta",
                                      icon: UserX,
                                      onClick: () => setPending({ type: "suspend", user: u }),
                                    },
                                    {
                                      label: "Bloquear login",
                                      icon: Ban,
                                      danger: true,
                                      onClick: () => setPending({ type: "block", user: u }),
                                    },
                                  ]
                                : [
                                    {
                                      label: "Reativar conta",
                                      icon: RefreshCw,
                                      onClick: () => setPending({ type: "reactivate", user: u }),
                                    },
                                  ]),
                              {
                                label: "Encerrar sessões",
                                icon: ShieldOff,
                                separatorBefore: true,
                                onClick: () => setPending({ type: "revoke", user: u }),
                              },
                              {
                                label: "Redefinir MFA",
                                icon: KeyRound,
                                disabled: !u.twoFactorEnabled,
                                onClick: () => setPending({ type: "reset-mfa", user: u }),
                              },
                            ]}
                          />
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
                          <ActionMenu
                            aria-label={`Segurança de ${u.name}`}
                            items={[
                              {
                                label: "Ver detalhes",
                                onClick: () => setDetailUserId(u.id),
                              },
                              {
                                label: "Encerrar sessões",
                                icon: ShieldOff,
                                onClick: () => setPending({ type: "revoke", user: u }),
                              },
                              {
                                label: "Redefinir MFA",
                                icon: KeyRound,
                                disabled: !u.twoFactorEnabled,
                                onClick: () => setPending({ type: "reset-mfa", user: u }),
                              },
                              ...(u.status === "ACTIVE" || u.isActive !== false
                                ? [
                                    {
                                      label: "Suspender conta",
                                      icon: UserX,
                                      separatorBefore: true,
                                      onClick: () => setPending({ type: "suspend", user: u }),
                                    },
                                  ]
                                : [
                                    {
                                      label: "Reativar conta",
                                      icon: RefreshCw,
                                      separatorBefore: true,
                                      onClick: () => setPending({ type: "reactivate", user: u }),
                                    },
                                  ]),
                            ]}
                          />
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

      <NewUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <UserDetailDialog
        userId={detailUserId}
        onClose={() => setDetailUserId(null)}
        onAction={(type, u) => setPending({ type, user: u })}
      />

      <Modal
        open={Boolean(pending) && pending?.type !== "block" && pending?.type !== "reset-mfa"}
        onClose={() => !pendingBusy && setPending(null)}
        title={
          pending?.type === "suspend"
            ? "Suspender conta"
            : pending?.type === "reactivate"
              ? "Reativar conta"
              : "Encerrar sessões"
        }
        description={
          pending?.type === "suspend"
            ? `${pending.user.name} não conseguirá entrar enquanto a conta estiver suspensa. Os vínculos com empresas são preservados.`
            : pending?.type === "reactivate"
              ? `A conta de ${pending?.user.name} voltará a poder entrar no sistema.`
              : `Todas as sessões ativas de ${pending?.user.name} serão encerradas imediatamente.`
        }
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4 text-[13px]"
              disabled={pendingBusy}
              onClick={() => setPending(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 px-4 text-[13px]"
              disabled={pendingBusy}
              onClick={runPending}
            >
              {pendingBusy ? "Processando…" : "Confirmar"}
            </button>
          </div>
        }
      >
        <p className="text-[13px] text-ink-secondary dark:text-gray-300">
          {pending?.user.email}
        </p>
      </Modal>

      <CriticalActionDialog
        open={pending?.type === "block" || pending?.type === "reset-mfa"}
        onClose={() => {
          if (pendingBusy) return;
          setPending(null);
          setConfirmCheck(false);
          setConfirmText("");
        }}
        title={pending?.type === "reset-mfa" ? "Redefinir MFA" : "Bloquear login"}
        description={
          pending?.type === "reset-mfa"
            ? `O segundo fator de ${pending.user.name} será removido. A pessoa precisará configurar o MFA de novo.`
            : `O login de ${pending?.user.name || "este usuário"} será bloqueado por política de segurança. A conta e os vínculos com empresas não serão excluídos.`
        }
        tone="danger"
        summaryRows={[
          { label: "Usuário", value: pending?.user.name || "—" },
          { label: "E-mail", value: pending?.user.email || "—" },
          {
            label: "Ação",
            value: pending?.type === "reset-mfa" ? "Redefinir MFA" : "Bloquear login",
            tone: "danger",
          },
        ]}
        checkboxLabel={
          pending?.type === "reset-mfa"
            ? "Entendo que o MFA atual será invalidado."
            : "Entendo que esta pessoa não conseguirá entrar até ser desbloqueada."
        }
        checkboxChecked={confirmCheck}
        onCheckboxChange={setConfirmCheck}
        confirmExpectedText={pending?.type === "reset-mfa" ? "REDEFINIR MFA" : "BLOQUEAR"}
        confirmInput={confirmText}
        onConfirmInputChange={setConfirmText}
        actionLabel={pending?.type === "reset-mfa" ? "Redefinir MFA" : "Bloquear login"}
        onAction={runPending}
        isLoading={pendingBusy}
      />

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="admin-btn-ghost h-8 px-2.5 text-[12px]"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="text-[12px] text-gray-500">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            className="admin-btn-ghost h-8 px-2.5 text-[12px]"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima
          </button>
        </div>
      ) : null}
    </div>
  );
}
