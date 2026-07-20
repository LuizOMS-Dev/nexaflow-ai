"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Building2,
  CreditCard,
  MessageSquare,
  Users,
  Wallet,
} from "lucide-react";
import { api, ApiError, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState, Spinner, StatCard } from "@/components/ui";
import {
  AttentionPanel,
  type AttentionItem,
  type AttentionTone,
} from "@/components/attention-panel";
import { AdminPageHeader } from "./admin-page-header";

type Overview = {
  stats: {
    tenants: number;
    users: number;
    conversations: number;
    messages: number;
    contacts?: number;
    activeAgents?: number;
    automationRuns?: number;
    activeTenants?: number;
    suspendedTenants?: number;
    trialTenants?: number;
    paidSubscriptions?: number;
    mrr?: number;
    arr?: number;
    avgTicket?: number;
  };
  finance?: {
    mrr: number;
    arr: number;
    avgTicket: number;
    paidSubscriptions: number;
    revenueByPlan: Array<{
      planId: string;
      planName: string;
      planSlug?: string;
      priceMonthly: number | null;
      priceOnRequest?: boolean;
      priceLabel?: string;
      isActive?: boolean;
      tenants: number;
      mrr: number;
    }>;
    costsAvailable: boolean;
    profitAvailable: boolean;
    note: string;
  };
  usage?: {
    conversations: number;
    messages: number;
    contacts: number;
    activeAgents: number;
    automationRuns: number;
  };
  recentTenants: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    plan?: { name: string } | null;
    _count: { members: number };
  }>;
  alerts?: Array<{
    id: string;
    severity: "warning" | "danger" | "info";
    title: string;
    href?: string;
  }>;
};

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Trial",
  BLOCKED: "Bloqueada",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  PENDING_DELETION: "Exclusão agendada",
};

function catalogPriceDisplay(r: {
  priceOnRequest?: boolean;
  priceLabel?: string;
  priceMonthly: number | null;
  planSlug?: string;
}): string {
  if (r.priceLabel) return r.priceLabel;
  if (r.priceOnRequest || r.planSlug === "enterprise") return "Sob consulta";
  if (r.priceMonthly == null || r.priceMonthly <= 0) return "Sob consulta";
  return formatCurrency(r.priceMonthly);
}

export default function AdminOverviewPage() {
  const user = useAuth((s) => s.user);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api<Overview>("/admin/overview"),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  if (user?.platformRole !== "SUPERADMIN") {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    // MFA: gate principal está no AdminShell; não tratar como erro de carregamento
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <EmptyState title="Não foi possível carregar a visão geral. Tente novamente." />
    );
  }

  const s = data.stats;
  const fin = data.finance;
  const usage = data.usage;
  const recent = (data.recentTenants || []).slice(0, 5);
  const alerts = data.alerts || [];

  const attentionItems: AttentionItem[] = alerts.map((a) => {
    const tone: AttentionTone =
      a.severity === "danger" ? "danger" : a.severity === "warning" ? "warning" : "info";
    return {
      id: a.id,
      title: a.title,
      href: a.href,
      actionLabel: a.href ? "Ver" : undefined,
      tone,
    };
  });

  return (
    <div>
      <AdminPageHeader
        title="Visão geral"
      />

      {/* 1. KPIs */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Empresas ativas"
          value={s.activeTenants ?? "—"}
          hint={`${s.tenants} no total`}
          icon={<Building2 className="h-4 w-4" />}
        />
        <StatCard
          label="Assinaturas pagas"
          value={s.paidSubscriptions ?? "—"}
          hint={
            s.trialTenants != null && s.trialTenants > 0
              ? `${s.trialTenants} em trial`
              : undefined
          }
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          label="MRR estimado"
          value={
            s.mrr != null && Number.isFinite(s.mrr) ? formatCurrency(s.mrr) : "—"
          }

          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Usuários"
          value={s.users}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {/* 2. Prioridades da plataforma */}
      <AttentionPanel
        className="mb-4"
        title="Alertas"
        items={attentionItems}
        emptyTitle="Nenhum alerta"
        variant="compact"
        countLabel={(n) => (n === 1 ? "1 alerta" : `${n} alertas`)}
      />

      {/* 3. Financeiro resumido (densidade executiva) */}
      <section className="mb-4 rounded-2xl border border-black/[0.05] p-3.5 dark:border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
            Receita por plano
          </h3>
          <Link
            href="/admin/finance"
            className="text-[12px] font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Ver financeiro
          </Link>
        </div>

        {fin?.revenueByPlan?.length ? (
          <ul className="mt-2 divide-y divide-line-soft dark:divide-white/[0.05]">
            {fin.revenueByPlan
              .filter((r) => r.tenants > 0 || (r.priceMonthly != null && r.priceMonthly > 0) || r.priceOnRequest)
              .slice(0, 6)
              .map((r) => (
              <li
                key={r.planId}
                className="flex items-center justify-between gap-3 py-1.5 text-[13px]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink dark:text-white">{r.planName}</p>
                  <p className="text-[11px] text-ink-faint">
                    {r.tenants} emp. · {catalogPriceDisplay(r)}
                    {!r.priceOnRequest && r.planSlug !== "enterprise" && r.priceMonthly ? "/mês" : ""}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-ink dark:text-white">
                  {formatCurrency(r.mrr)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-ink-muted">Nenhuma assinatura paga ainda.</p>
        )}
      </section>

      {/* 4. Empresas recentes + uso */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-black/[0.05] p-3.5 dark:border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
              Empresas recentes
            </h3>
            <Link
              href="/admin/companies"
              className="text-[12px] font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Ver todas
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nenhuma empresa cadastrada.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-soft dark:divide-white/[0.05]">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink dark:text-white">
                      {t.name}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {t.plan?.name || "Sem plano"} · {statusLabel[t.status] || t.status} ·{" "}
                      {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="btn-ghost btn-sm h-7 shrink-0 px-2 text-[11px]"
                  >
                    Ver
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-black/[0.05] p-3.5 dark:border-white/[0.06]">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
            Uso da plataforma
          </h3>
          <dl className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(
              [
                {
                  label: "Conversas",
                  value: usage?.conversations ?? s.conversations,
                  icon: MessageSquare,
                },
                {
                  label: "Mensagens",
                  value: usage?.messages ?? s.messages,
                },
                {
                  label: "Contatos",
                  value: usage?.contacts ?? s.contacts,
                },
                {
                  label: "Agentes ativos",
                  value: usage?.activeAgents ?? s.activeAgents,
                },
                {
                  label: "Exec. automações",
                  value: usage?.automationRuns ?? s.automationRuns,
                },
              ] as const
            )
              .filter((row) => row.value != null)
              .map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                >
                  <dt className="text-[10px] font-medium text-ink-faint">{row.label}</dt>
                  <dd className="mt-0.5 text-base font-semibold tabular-nums text-ink dark:text-white">
                    {Number(row.value).toLocaleString("pt-BR")}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
