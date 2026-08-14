"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import { ROLE_LABEL, STATUS_LABEL } from "../labels";
import {
  DataTable,
  EmptyHint,
  ErrorHint,
  FilterBar,
  PageHeader,
  Pagination,
  Skeleton,
  Td,
  Th,
  ToneBadge,
  inputClass,
} from "../ui";

export function UsersPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <UsersInner />
    </Suspense>
  );
}

function UsersInner() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const filters = {
    search: sp.get("q") || "",
    scope: sp.get("scope") || "all",
    status: sp.get("status") || "ALL",
    page: Number(sp.get("page") || 1),
  };

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.replace(`/admin/users?${next.toString()}`);
  }

  const list = useQuery({
    queryKey: ["platform-users", filters],
    queryFn: () =>
      platformAdminApi.users({
        search: filters.search || undefined,
        scope: filters.scope,
        status: filters.status,
        page: filters.page,
        limit: 30,
      }),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  const mut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      platformAdminApi.patchUserStatus(id, status, reason || undefined),
    onSuccess: () => {
      toast({ title: "Status atualizado.", kind: "success" });
      void qc.invalidateQueries({ queryKey: ["platform-users"] });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Falha.", kind: "error" }),
  });

  if (list.isLoading) return <Skeleton />;
  if (list.error || !list.data) {
    if (isSuperadminMfaRequiredError(list.error)) return null;
    return <ErrorHint title="Não foi possível carregar os usuários" onRetry={() => void list.refetch()} />;
  }

  const data = list.data;

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Contas globais da plataforma. Papel de empresa e superadmin são coisas diferentes."
      />

      <FilterBar>
        <input
          className={`${inputClass} max-w-xs border-white/[0.08] bg-transparent`}
          placeholder="Buscar nome ou e-mail"
          defaultValue={filters.search}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
        <select
          className={`${inputClass} w-auto border-white/[0.08] bg-transparent`}
          value={filters.scope}
          onChange={(e) => setParam("scope", e.target.value)}
        >
          <option value="all">Todos</option>
          <option value="companies">De empresas</option>
          <option value="platform">Superadmins</option>
        </select>
        <select
          className={`${inputClass} w-auto border-white/[0.08] bg-transparent`}
          value={filters.status}
          onChange={(e) => setParam("status", e.target.value)}
        >
          <option value="ALL">Status: todos</option>
          <option value="ACTIVE">Ativo</option>
          <option value="INVITED">Convidado</option>
          <option value="SUSPENDED">Suspenso</option>
          <option value="DISABLED">Bloqueado</option>
        </select>
        <input
          className={`${inputClass} max-w-[220px] border-white/[0.08] bg-transparent`}
          placeholder="Motivo da ação (opcional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </FilterBar>

      {data.items.length === 0 ? (
        <EmptyHint title="Nenhum usuário">Ajuste busca ou filtros.</EmptyHint>
      ) : (
        <DataTable minWidth="760px">
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Papel</Th>
              <Th>Status</Th>
              <Th>Empresas</Th>
              <Th>Último acesso</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {data.items.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.02]">
                <Td>
                  <p className="font-medium text-white">{u.name}</p>
                  <p className="text-[11px] text-white/40">{u.email}</p>
                </Td>
                <Td className="text-white/70">
                  {u.platformRole === "SUPERADMIN" ? "Superadmin" : "Usuário"}
                  {u.twoFactorEnabled ? (
                    <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      MFA
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <ToneBadge code={u.status || (u.isActive ? "ACTIVE" : "DISABLED")}>
                    {STATUS_LABEL[u.status || ""] || (u.isActive ? "Ativo" : "Inativo")}
                  </ToneBadge>
                </Td>
                <Td className="max-w-[200px] text-white/55">
                  <span className="line-clamp-2">
                    {(u.memberships || [])
                      .map((m) => `${m.tenant.name} (${ROLE_LABEL[m.role] || m.role})`)
                      .join(", ") || "—"}
                  </span>
                </Td>
                <Td className="text-white/40">
                  {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Nunca"}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="admin-btn-ghost h-8 text-[12px]"
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ id: u.id, status: "ACTIVE" })}
                    >
                      Ativar
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost h-8 text-[12px]"
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ id: u.id, status: "SUSPENDED" })}
                    >
                      Suspender
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost h-8 text-[12px] text-red-200"
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ id: u.id, status: "DISABLED" })}
                    >
                      Bloquear
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        unit="usuários"
        onPage={(p) => setParam("page", String(p))}
      />
    </div>
  );
}
