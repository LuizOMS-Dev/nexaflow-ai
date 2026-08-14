"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import { actionLabel } from "../labels";
import { EmptyHint, ErrorHint, FilterBar, PageHeader, Skeleton, inputClass } from "../ui";

export function AuditPage() {
  const user = useAuth((s) => s.user);
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["platform-audit", search],
    queryFn: () => platformAdminApi.logs({ take: "80", search: search || undefined }),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return (
      <ErrorHint title="Não foi possível carregar a auditoria" onRetry={() => void q.refetch()} />
    );
  }

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Eventos reais da plataforma. Metadados sensíveis já vêm redigidos."
        actions={
          <button
            type="button"
            className="admin-btn-secondary h-9"
            onClick={() => void q.refetch()}
          >
            Atualizar
          </button>
        }
      />
      <FilterBar>
        <input
          className={`${inputClass} max-w-sm border-white/[0.08] bg-transparent`}
          placeholder="Filtrar por ação (Enter)"
          defaultValue={search}
          onKeyDown={(e) => {
            if (e.key === "Enter") setSearch((e.target as HTMLInputElement).value);
          }}
        />
        <span className="px-2 text-[12px] text-white/40">
          {q.data.items.length} evento{q.data.items.length === 1 ? "" : "s"}
        </span>
      </FilterBar>
      {q.data.items.length === 0 ? (
        <EmptyHint title="Nenhum evento">Tente outro filtro ou aguarde novas ações.</EmptyHint>
      ) : (
        <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06] bg-white/[0.015]">
          {q.data.items.map((item) => (
            <li key={item.id} className="px-4 py-2.5 transition-colors hover:bg-white/[0.02]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-white/90">{actionLabel(item.action)}</p>
                <p className="text-[11px] tabular-nums text-white/35">{formatDate(item.createdAt)}</p>
              </div>
              <p className="mt-0.5 text-[12px] text-white/40">
                {item.user?.email || "Sistema"}
                {item.tenant ? ` · ${item.tenant.name}` : ""}
                {item.entity ? ` · ${item.entity}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
