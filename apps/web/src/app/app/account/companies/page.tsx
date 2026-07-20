"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/store/auth";

const rolePt: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  SALES: "Comercial",
  READONLY: "Leitura",
};

export default function AccountCompaniesPage() {
  const memberships = useAuth((s) => s.memberships);
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

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden sm:max-w-lg">
        <div className="border-b border-line-soft px-5 py-4 dark:border-white/[0.06]">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
            Empresas
          </h2>
        </div>

        {list.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            Nenhuma empresa vinculada.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft dark:divide-white/[0.05]">
            {list.map((m) => {
              const active = m.tenantId === tenant?.id;
              return (
                <li
                  key={m.tenantId}
                  className={cn(
                    "flex items-center justify-between gap-3 px-5 py-3",
                    active && "bg-brand-500/[0.04]"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink dark:text-white">
                        {m.tenant.name}
                      </p>
                      {active ? (
                        <span className="badge-brand">Atual</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-faint">
                      {rolePt[m.role] || m.role}
                    </p>
                  </div>
                  {!active && memberships.length > 1 ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm shrink-0"
                      onClick={() => {
                        void switchTenant(m.tenantId).then(() => {
                          window.location.href = "/app";
                        });
                      }}
                    >
                      Entrar
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>


    </div>
  );
}
