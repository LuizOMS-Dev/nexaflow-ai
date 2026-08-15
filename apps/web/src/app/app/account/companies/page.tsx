"use client";

import { Building2, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { AccountCard } from "../account-ui";

const rolePt: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  SALES: "Vendas",
  READONLY: "Somente leitura",
};

export default function AccountCompaniesPage() {
  const memberships = useAuth((s) => s.memberships) || [];
  const tenant = useAuth((s) => s.tenant);
  const switchTenant = useAuth((s) => s.switchTenant);
  const user = useAuth((s) => s.user);

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const list =
    memberships.length > 0
      ? memberships
      : tenant
        ? [
            {
              tenantId: tenant.id,
              role: tenant.role || "MEMBER",
              tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
              },
            },
          ]
        : [];

  const multi = list.length > 1;

  return (
    <div className="space-y-6">
      <AccountCard
        title="Empresas e workspaces vinculados"
        description="Organizações e ambientes de trabalho aos quais sua conta tem permissão de acesso."
        flush
      >
        <div>
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.03] text-zinc-500 dark:bg-white/[0.05]">
                <Building2 className="h-5 w-5" strokeWidth={1.5} />
              </span>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                Nenhuma empresa vinculada no momento.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {list.map((m) => {
                const active = m.tenantId === tenant?.id;
                const initials = (m.tenant.name || "E")
                  .split(" ")
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <li
                    key={m.tenantId}
                    className={cn(
                      "flex items-center justify-between gap-4 p-5 sm:px-6 transition-colors",
                      active && multi
                        ? "bg-violet-500/[0.02] dark:bg-violet-500/[0.03]"
                        : "hover:bg-black/[0.01] dark:hover:bg-white/[0.015]"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-xs font-bold text-white shadow-xs">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13.5px] font-semibold text-ink dark:text-white">
                            {m.tenant.name}
                          </p>
                          {active ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                              <Check className="h-3 w-3" strokeWidth={2.5} />
                              Empresa ativa
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400">
                          {rolePt[m.role] || m.role}
                        </p>
                      </div>
                    </div>

                    {!active && multi ? (
                      <button
                        type="button"
                        className="btn-secondary h-8.5 shrink-0 px-3.5 text-xs font-medium gap-1.5"
                        onClick={() => {
                          void switchTenant(m.tenantId).then(() => {
                            window.location.href = "/app";
                          });
                        }}
                      >
                        <span>Acessar</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AccountCard>
    </div>
  );
}
