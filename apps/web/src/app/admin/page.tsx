"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Building2,
  CreditCard,
  MessageSquare,
  Users,
  Wallet,
  Bot,
  Zap,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  AdminSectionLink,
  MetricCard,
  MetricGrid,
  StatusBadge,
  statusToTone,
} from "@/components/admin";
import {
  AttentionPanel,
  type AttentionItem,
  type AttentionTone,
} from "@/components/attention-panel";

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
  PENDING_DELETION: "Exclusão",
};

export default function AdminOverviewPage() {
  const user = useAuth((s) => s.user);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api<Overview>("/admin/overview"),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  if (user?.platformRole !== "SUPERADMIN") return null;
  if (isLoading) return <AdminPageSkeleton metrics={4} />;

  if (error || !data) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar a visão geral"
        onRetry={() => void refetch()}
      />
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

  const planBars = (fin?.revenueByPlan || [])
    .filter((r) => r.tenants > 0 || r.mrr > 0)
    .slice(0, 5);
  const maxPlanMrr = Math.max(1, ...planBars.map((r) => r.mrr || 0));

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Visão geral" />

      <MetricGrid cols={4}>
        <MetricCard
          label="Empresas ativas"
          value={s.activeTenants ?? "—"}
          hint={`${s.tenants} total · ${s.trialTenants ?? 0} trial`}
          icon={<Building2 className="h-4 w-4" />}
          tone="brand"
          href="/admin/companies"
          compact
        />
        <MetricCard
          label="Assinaturas pagas"
          value={s.paidSubscriptions ?? "—"}
          hint={
            s.suspendedTenants ? `${s.suspendedTenants} suspensas` : undefined
          }
          icon={<CreditCard className="h-4 w-4" />}
          tone="violet"
          href="/admin/finance"
          compact
        />
        <MetricCard
          label="MRR"
          value={
            s.mrr != null && Number.isFinite(s.mrr) ? formatCurrency(s.mrr) : "—"
          }
          hint={
            s.arr != null && Number.isFinite(s.arr)
              ? `ARR ${formatCurrency(s.arr)}`
              : undefined
          }
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          href="/admin/finance"
          compact
        />
        <MetricCard
          label="Usuários"
          value={s.users}
          hint={
            usage?.messages != null
              ? `${Number(usage.messages).toLocaleString("pt-BR")} msgs`
              : undefined
          }
          icon={<Users className="h-4 w-4" />}
          href="/admin/users"
          compact
        />
      </MetricGrid>

      {attentionItems.length > 0 ? (
        <AttentionPanel
          title="Alertas"
          items={attentionItems}
          emptyTitle="Nenhum alerta"
          variant="compact"
          countLabel={(n) => (n === 1 ? "1 alerta" : `${n} alertas`)}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection
          title="Receita por plano"
          action={<AdminSectionLink href="/admin/finance">Financeiro</AdminSectionLink>}
        >
          {planBars.length === 0 ? (
            <p className="text-[13px] text-gray-500">Sem assinaturas pagas.</p>
          ) : (
            <ul className="space-y-2.5">
              {planBars.map((r) => (
                <li key={r.planId}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium text-white/90">
                      {r.planName}
                      <span className="ml-1.5 font-normal text-gray-500">
                        · {r.tenants}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-white">
                      {formatCurrency(r.mrr)}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-violet-500/80"
                      style={{
                        width: `${Math.max(4, (r.mrr / maxPlanMrr) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {fin && !fin.costsAvailable ? (
            <p className="mt-3 text-[12px] text-amber-200/80">
              Custos não configurados.{" "}
              <Link href="/admin/finance" className="underline-offset-2 hover:underline">
                Abrir financeiro
              </Link>
            </p>
          ) : null}
        </AdminSection>

        <AdminSection
          title="Empresas recentes"
          action={<AdminSectionLink href="/admin/companies">Todas</AdminSectionLink>}
          flush
        >
          {recent.length === 0 ? (
            <p className="px-4 py-5 text-[13px] text-gray-500 sm:px-5">
              Nenhuma empresa ainda.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {recent.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-white">
                        {t.name}
                      </p>
                      <StatusBadge tone={statusToTone(t.status)} dot>
                        {statusLabel[t.status] || t.status}
                      </StatusBadge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {t.plan?.name || "Sem plano"} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="admin-btn-ghost h-8 shrink-0 px-2 text-[12px]"
                  >
                    Abrir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>

      {/* Uso — uma linha compacta, sem segunda grade de cards */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[12px] text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 opacity-60" />
          {(usage?.conversations ?? s.conversations).toLocaleString("pt-BR")} conversas
        </span>
        <span className="text-white/15">·</span>
        <span>
          {(usage?.messages ?? s.messages).toLocaleString("pt-BR")} mensagens
        </span>
        <span className="text-white/15">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 opacity-60" />
          {usage?.activeAgents ?? s.activeAgents ?? 0} agentes
        </span>
        <span className="text-white/15">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 opacity-60" />
          {(usage?.automationRuns ?? s.automationRuns ?? 0).toLocaleString("pt-BR")} autom.
        </span>
        {isFetching ? (
          <>
            <span className="text-white/15">·</span>
            <span className="text-gray-600">atualizando…</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
