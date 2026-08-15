"use client";

import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { AccountPanel, AccountPanelHead } from "../account-ui";

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
    <AccountPanel>
      <AccountPanelHead
        title="Empresas Vinculadas"
        subtitle="Organizações e workspaces associados à sua conta de usuário"
      />

      <div>
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.03] text-ink-muted dark:bg-white/[0.05]">
              <Building2 className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <p className="text-xs text-ink-muted dark:text-zinc-400">
              Nenhuma empresa vinculada.
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
                    "flex items-center justify-between gap-4 px-6 py-4 transition-colors",
                    active && multi && "bg-violet-500/[0.03] dark:bg-violet-500/[0.05]"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 text-xs font-bold text-white shadow-xs">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-ink dark:text-white">
                          {m.tenant.name}
                        </p>
                        {active ? (
                          <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                            Atual
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
                      className="btn-secondary h-8 shrink-0 px-3 text-xs"
                      onClick={() => {
                        void switchTenant(m.tenantId).then(() => {
                          window.location.href = "/app";
                        });
                      }}
                    >
                      Alternar
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AccountPanel>
  );
}
