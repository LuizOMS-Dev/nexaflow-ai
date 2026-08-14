"use client";

import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Building2, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { platformAdminApi } from "../api";
import { STATUS_LABEL } from "../labels";
import {
  EmptyHint,
  ErrorHint,
  PageHeader,
  Panel,
  ProgressBar,
  Skeleton,
  StatCard,
  ToneBadge,
} from "../ui";

export function OverviewPage() {
  const user = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => platformAdminApi.overview(),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
    staleTime: 20_000,
  });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return (
      <ErrorHint title="Não foi possível carregar a visão geral" onRetry={() => void q.refetch()} />
    );
  }

  const s = q.data.stats;
  const fin = q.data.finance;
  const alerts = q.data.alerts || [];
  const recent = q.data.recentTenants || [];
  const planBars = (fin?.revenueByPlan || []).filter((r) => r.tenants > 0 || r.mrr > 0).slice(0, 6);
  const maxMrr = Math.max(1, ...planBars.map((r) => r.mrr || 0));
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "Admin";

  return (
    <div>
      <PageHeader
        title={`Olá, ${firstName}`}
        description="Operação da plataforma: empresas, cobrança e o que precisa da sua atenção."
        actions={
          <Link href="/admin/companies" className="admin-btn-primary">
            <Building2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Empresas
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Empresas ativas"
          value={s.activeTenants ?? "—"}
          hint={`${s.tenants} no total · ${s.trialTenants ?? 0} em trial`}
          href="/admin/companies?status=ACTIVE"
          tone="ok"
        />
        <StatCard
          label="Assinaturas"
          value={s.paidSubscriptions ?? "—"}
          hint={
            s.suspendedTenants
              ? `${s.suspendedTenants} suspensas`
              : "Empresas com valor contratado"
          }
          href="/admin/finance"
        />
        <StatCard
          label="MRR estimado"
          value={s.mrr != null ? formatCurrency(s.mrr) : "—"}
          hint={s.arr != null ? `ARR ${formatCurrency(s.arr)}` : undefined}
          href="/admin/finance"
        />
        <StatCard
          label="Usuários"
          value={s.users}
          hint={`${(q.data.usage?.messages ?? s.messages).toLocaleString("pt-BR")} mensagens`}
          href="/admin/users"
        />
      </div>

      {alerts.length > 0 ? (
        <Panel title="Atenção" className="mt-4" flush>
          <ul className="divide-y divide-white/[0.05]">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link
                  href={a.href || "/admin"}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">
                    <AlertTriangle className="h-4 w-4" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-white/85">{a.title}</span>
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-200">
                    Ver
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Receita por plano"
          action={
            <Link href="/admin/finance" className="text-[12px] font-medium text-violet-200 hover:text-violet-100">
              Financeiro
            </Link>
          }
        >
          {planBars.length === 0 ? (
            <EmptyHint title="Sem assinaturas pagas">
              Quando houver empresas com plano pago, o MRR aparece aqui.
            </EmptyHint>
          ) : (
            <ul className="space-y-3">
              {planBars.map((r) => (
                <li key={r.planId}>
                  <div className="mb-1.5 flex justify-between gap-2 text-[13px]">
                    <span className="truncate text-white/85">
                      {r.planName}
                      <span className="ml-1.5 text-white/40">· {r.tenants}</span>
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-white">
                      {formatCurrency(r.mrr)}
                    </span>
                  </div>
                  <ProgressBar value={r.mrr} max={maxMrr} />
                </li>
              ))}
            </ul>
          )}
          {fin && !fin.costsAvailable ? (
            <p className="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-100/80">
              Custos da plataforma não estão cadastrados — lucro não é exibido.
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Empresas recentes"
          action={
            <Link href="/admin/companies" className="text-[12px] font-medium text-violet-200 hover:text-violet-100">
              Todas
            </Link>
          }
          flush
        >
          {recent.length === 0 ? (
            <EmptyHint title="Nenhuma empresa">Crie a primeira em Empresas.</EmptyHint>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-white">{t.name}</p>
                      <ToneBadge code={t.status}>{STATUS_LABEL[t.status] || t.status}</ToneBadge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      {t.plan?.name || "Sem plano"} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/companies/${t.id}`}
                    className="admin-btn-ghost h-8 shrink-0 px-2 text-[12px]"
                  >
                    Abrir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <QuickLink href="/admin/users" icon={Users} label="Usuários" detail="Contas e MFA" />
        <QuickLink href="/admin/leads" icon={Building2} label="Leads" detail="Pedidos de demo" />
        <QuickLink href="/admin/system" icon={Activity} label="Sistema" detail="Saúde e diagnóstico" />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  detail,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-200">
        <Icon className="h-4 w-4" strokeWidth={1.7} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-white/90">{label}</span>
        <span className="block text-[11px] text-white/40">{detail}</span>
      </span>
    </Link>
  );
}
