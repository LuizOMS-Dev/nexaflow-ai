"use client";

import { useState } from "react";
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
  RefreshCw,
  CircleDollarSign,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Send,
  Server,
  Database,
  Cpu,
  Mail,
  Smartphone,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency, formatDate, pluralizePt } from "@/lib/utils";
import { humanizeAuditAction } from "@/lib/audit-labels";
import {
  AdminErrorState,
  AdminPageHeader,
  AdminSection,
  AdminSectionLink,
  MetricCard,
  MetricGrid,
  StatusBadge,
  statusToTone,
} from "@/components/admin";

type Overview = {
  periodDays: number;
  stats: {
    tenants: number;
    users: number;
    newUsersPeriod?: number;
    prevUsersPeriod?: number;
    conversations: number;
    conversationsPeriod?: number;
    prevConversationsPeriod?: number;
    messages: number;
    messagesPeriod?: number;
    prevMessagesPeriod?: number;
    contacts?: number;
    activeAgents?: number;
    automationRuns?: number;
    automationRunsPeriod?: number;
    prevAutomationRunsPeriod?: number;
    activeTenants?: number;
    suspendedTenants?: number;
    blockedTenants?: number;
    trialTenants?: number;
    cancelledTenants?: number;
    overdueTenants?: number;
    dueSoonTenants?: number;
    trialsExpiringSoon?: number;
    paidSubscriptions?: number;
    paidRatio?: number;
    newTenantsPeriod?: number;
    prevTenantsPeriod?: number;
    mrr?: number;
    arr?: number;
    avgTicket?: number;
  };
  finance?: {
    mrr: number;
    arr: number;
    avgTicket: number;
    paidSubscriptions: number;
    paidRatio?: number;
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
      sharePercentage?: number;
    }>;
    costsAvailable: boolean;
    profitAvailable: boolean;
    note: string;
  };
  usage?: {
    periodDays: number;
    conversations: number;
    conversationsPeriod?: number;
    prevConversationsPeriod?: number;
    messages: number;
    messagesPeriod?: number;
    prevMessagesPeriod?: number;
    contacts: number;
    activeAgents: number;
    automationRuns: number;
    automationRunsPeriod?: number;
    prevAutomationRunsPeriod?: number;
  };
  recentTenants: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    plan?: { name: string } | null;
    _count?: { members: number };
  }>;
  recentActivity?: Array<{
    id: string;
    action: string;
    description: string;
    entity: string;
    entityId?: string | null;
    userName: string;
    tenantName?: string | null;
    createdAt: string;
  }>;
  health?: {
    overall: "operational" | "degraded" | "down";
    dependencies: Array<{
      id: string;
      name: string;
      tier: "CRITICAL" | "OPTIONAL";
      status: "operational" | "degraded" | "down" | "not_configured";
      impact: string;
      detail?: string;
    }>;
  } | null;
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

function formatRelativeTime(isoString: string): string {
  try {
    const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSec < 60) return "agora";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `há ${diffHours} ${pluralizePt(diffHours, "hora", "horas")}`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `há ${diffDays} ${pluralizePt(diffDays, "dia", "dias")}`;
    return formatDate(isoString);
  } catch {
    return formatDate(isoString);
  }
}

export default function AdminOverviewPage() {
  const user = useAuth((s) => s.user);
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview", days],
    queryFn: () => api<Overview>(`/admin/overview?days=${days}`),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-72 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
          <div className="h-9 w-48 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-48 rounded-xl bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800" />
          <div className="h-48 rounded-xl bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800" />
        </div>
        <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800" />
      </div>
    );
  }

  if (error || !data) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar a visão geral"
        description="Ocorreu um problema ao consolidar os indicadores executivos."
        onRetry={() => void refetch()}
      />
    );
  }

  const s = data.stats;
  const fin = data.finance;
  const usage = data.usage;
  const recentTenants = data.recentTenants || [];
  const recentActivity = data.recentActivity || [];
  const alerts = data.alerts || [];
  const healthDeps = data.health?.dependencies || [];

  const paidPlans = (fin?.revenueByPlan || []).filter((r) => r.tenants > 0 || r.mrr > 0);
  const totalMrr = s.mrr || 0;
  const maxPlanMrr = Math.max(1, ...paidPlans.map((r) => r.mrr || 0));

  return (
    <div className="space-y-6">
      {/* ── 1. Cabeçalho Executivo com Seletor Temporal ── */}
      <AdminPageHeader
        title="Visão geral"
        description="Acompanhe os principais indicadores e a saúde da plataforma."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] p-0.5 text-[12px] font-medium text-zinc-600 dark:text-zinc-400">
              {[
                { label: "7 dias", value: 7 },
                { label: "30 dias", value: 30 },
                { label: "90 dias", value: 90 },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setDays(tab.value)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 transition-all duration-150 cursor-pointer",
                    days === tab.value
                      ? "bg-violet-600 text-white shadow-xs font-semibold"
                      : "hover:text-zinc-900 dark:hover:text-white"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar dados"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-violet-500")} />
            </button>
          </div>
        }
      />

      {/* ── 2. Grid de KPIs Principais ── */}
      <MetricGrid cols={4}>
        <MetricCard
          label="Empresas ativas"
          value={s.activeTenants ?? 0}
          hint={
            (s.trialTenants ?? 0) > 0 || (s.paidSubscriptions ?? 0) > 0
              ? `${s.trialTenants ?? 0} em trial · ${s.paidSubscriptions ?? 0} ${pluralizePt(s.paidSubscriptions ?? 0, "pagante", "pagantes")}`
              : `${s.tenants} ${pluralizePt(s.tenants, "empresa", "empresas")} no total`
          }
          icon={<Building2 className="h-4 w-4" />}
          tone="brand"
          href="/admin/companies"
          compact
        />
        <MetricCard
          label="Assinaturas pagas"
          value={s.paidSubscriptions ?? 0}
          hint={
            (s.activeTenants ?? 0) > 0
              ? `${s.paidRatio ?? 0}% das empresas ativas`
              : "Nenhuma empresa ativa"
          }
          icon={<CreditCard className="h-4 w-4" />}
          tone="violet"
          href="/admin/finance"
          compact
        />
        <MetricCard
          label="MRR"
          value={formatCurrency(s.mrr || 0)}
          hint={`ARR ${formatCurrency(s.arr || 0)}`}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          href="/admin/finance"
          compact
        />
        <MetricCard
          label="Usuários"
          value={s.users}
          hint={
            s.newUsersPeriod != null && s.newUsersPeriod > 0
              ? `+${s.newUsersPeriod} ${pluralizePt(s.newUsersPeriod, "adicionado", "adicionados")} no período`
              : "Cadastrados na plataforma"
          }
          icon={<Users className="h-4 w-4" />}
          href="/admin/users"
          compact
        />
      </MetricGrid>

      {/* ── 3. Receita por Plano & Empresas Recentes (Alturas Adaptativas) ── */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* Bloco: Receita */}
        <AdminSection
          title="Receita"
          description="Distribuição da receita recorrente por plano."
          action={<AdminSectionLink href="/admin/finance">Abrir Financeiro →</AdminSectionLink>}
        >
          {paidPlans.length === 0 ? (
            <div className="py-5 text-center space-y-2">
              <div className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <CircleDollarSign className="h-4.5 w-4.5" />
              </div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                Ainda não há receita recorrente
              </p>
              <p className="text-[11.5px] text-zinc-500 max-w-xs mx-auto">
                As métricas aparecerão assim que houver assinaturas ativas em planos pagos.
              </p>
              <div className="pt-1">
                <Link
                  href="/admin/plans"
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Ver planos comerciais <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2.5">
                {paidPlans.map((r) => (
                  <li key={r.planId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[12.5px]">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-white truncate">
                          {r.planName}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          · {r.tenants} {pluralizePt(r.tenants, "cliente", "clientes")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 tabular-nums">
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {formatCurrency(r.mrr)}
                        </span>
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 min-w-[32px] text-right">
                          {r.sharePercentage ?? (totalMrr > 0 ? Math.round((r.mrr / totalMrr) * 100) : 0)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-violet-600 dark:bg-violet-500 transition-all duration-300"
                        style={{
                          width: `${Math.max(4, (r.mrr / maxPlanMrr) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fin && !fin.costsAvailable ? (
            <div className="mt-3.5 flex items-center justify-between gap-2.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-2.5 px-3 text-[11.5px] text-amber-800 dark:text-amber-300/80">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="truncate">
                  <strong className="font-medium text-amber-900 dark:text-amber-200">Custos operacionais incompletos:</strong> Indicadores de margem serão calculados após configurar os custos.
                </span>
              </div>
              <Link href="/admin/finance" className="shrink-0 font-semibold text-amber-900 dark:text-amber-200 hover:underline">
                Configurar custos →
              </Link>
            </div>
          ) : null}
        </AdminSection>

        {/* Bloco: Empresas Recentes */}
        <AdminSection
          title="Empresas recentes"
          description="Últimas organizações cadastradas na plataforma."
          action={<AdminSectionLink href="/admin/companies">Ver todas →</AdminSectionLink>}
          flush
        >
          {recentTenants.length === 0 ? (
            <div className="px-5 py-6 text-center text-[12px] text-zinc-500">
              Nenhuma empresa criada recentemente.
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
              {recentTenants.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 hover:bg-black/[0.015] dark:hover:bg-white/[0.015] transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                        {t.name}
                      </p>
                      <StatusBadge tone={statusToTone(t.status)} dot>
                        {statusLabel[t.status] || t.status}
                      </StatusBadge>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {t.plan?.name || "Gratuito"} · Criada em {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="admin-btn-ghost h-7 px-2.5 text-[11.5px] font-medium shrink-0 rounded-lg"
                  >
                    Abrir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>

      {/* ── 4. Uso da Plataforma no Período Selecionado ── */}
      <AdminSection
        title="Uso da plataforma"
        description={`Métricas operacionais registradas nos últimos ${days} dias.`}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-3.5 space-y-1">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[12px] font-medium">Conversas</span>
              <MessageSquare className="h-4 w-4 text-violet-500" />
            </div>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">
              {(usage?.conversationsPeriod ?? s.conversationsPeriod ?? 0).toLocaleString("pt-BR")}
            </p>
            <p className="text-[11px] text-zinc-500">
              {(usage?.conversations ?? s.conversations).toLocaleString("pt-BR")} no total acumulado
            </p>
          </div>

          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-3.5 space-y-1">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[12px] font-medium">Mensagens</span>
              <Send className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">
              {(usage?.messagesPeriod ?? s.messagesPeriod ?? 0).toLocaleString("pt-BR")}
            </p>
            <p className="text-[11px] text-zinc-500">
              {(usage?.messages ?? s.messages).toLocaleString("pt-BR")} no total acumulado
            </p>
          </div>

          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-3.5 space-y-1">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[12px] font-medium">Agentes de IA habilitados</span>
              <Bot className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">
              {usage?.activeAgents ?? s.activeAgents ?? 0}
            </p>
            <p className="text-[11px] text-zinc-500">
              {usage?.activeAgents ?? s.activeAgents ?? 0} {pluralizePt(usage?.activeAgents ?? s.activeAgents ?? 0, "configurado atualmente", "configurados atualmente")}
            </p>
          </div>

          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-3.5 space-y-1">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[12px] font-medium">Automações executadas</span>
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">
              {(usage?.automationRunsPeriod ?? s.automationRunsPeriod ?? 0).toLocaleString("pt-BR")}
            </p>
            <p className="text-[11px] text-zinc-500">
              {(usage?.automationRuns ?? s.automationRuns ?? 0).toLocaleString("pt-BR")} {pluralizePt(usage?.automationRuns ?? s.automationRuns ?? 0, "execução acumulada", "execuções acumuladas")}
            </p>
          </div>
        </div>
      </AdminSection>

      {/* ── 5. Atividade Recente & Atenção Necessária (Alturas Adaptativas) ── */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* Atividade Recente */}
        <AdminSection
          title="Atividade recente"
          description="Eventos administrativos registrados no log de auditoria."
          action={<AdminSectionLink href="/admin/audit">Ver auditoria →</AdminSectionLink>}
          flush
        >
          {recentActivity.length === 0 ? (
            <div className="px-5 py-6 text-center text-[12px] text-zinc-500">
              Nenhuma atividade administrativa recente registrada.
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
              {recentActivity.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 hover:bg-black/[0.015] dark:hover:bg-white/[0.015] transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[12px] font-medium text-zinc-900 dark:text-white truncate">
                      {humanizeAuditAction(item.action)}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {item.userName}{item.tenantName ? ` · ${item.tenantName}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] text-zinc-400 shrink-0 tabular-nums">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        {/* Atenção Necessária */}
        <AdminSection
          title="Atenção necessária"
          description="Pendências operacionais e conformidade."
        >
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-3.5 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-[12.5px] font-semibold">Nenhuma ação crítica pendente</p>
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                  Não há incidentes ou pendências críticas no momento.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => {
                const isDanger = a.severity === "danger";
                const isWarning = a.severity === "warning";
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border p-2.5 px-3 transition-colors",
                      isDanger
                        ? "border-rose-500/20 bg-rose-500/5 text-rose-800 dark:text-rose-300"
                        : isWarning
                          ? "border-amber-500/20 bg-amber-500/5 text-amber-800 dark:text-amber-300"
                          : "border-blue-500/20 bg-blue-500/5 text-blue-800 dark:text-blue-300"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AlertTriangle
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isDanger
                            ? "text-rose-600 dark:text-rose-400"
                            : isWarning
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-blue-600 dark:text-blue-400"
                        )}
                      />
                      <span className="text-[12px] font-medium truncate">{a.title}</span>
                    </div>
                    {a.href ? (
                      <Link
                        href={a.href}
                        className="text-[11px] font-semibold shrink-0 hover:underline inline-flex items-center gap-1"
                      >
                        Ver <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </AdminSection>
      </div>

      {/* ── 6. Resumo de Saúde Operacional ── */}
      <AdminSection
        title="Saúde operacional"
        description="Status em tempo real dos serviços fundamentais da infraestrutura."
        action={<AdminSectionLink href="/admin/system/health">Ver Saúde →</AdminSectionLink>}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {healthDeps.map((dep) => {
            const isOp = dep.status === "operational";
            const isDown = dep.status === "down";
            const isDegraded = dep.status === "degraded";
            const isNotConfig = dep.status === "not_configured";

            const Icon =
              dep.id === "api"
                ? Server
                : dep.id === "postgres"
                  ? Database
                  : dep.id === "redis"
                    ? Cpu
                    : dep.id === "whatsapp"
                      ? Smartphone
                      : dep.id === "mail"
                        ? Mail
                        : Bot;

            return (
              <div
                key={dep.id}
                className={cn(
                  "flex flex-col justify-between rounded-xl border p-3 space-y-2",
                  isOp
                    ? "border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/[0.04]"
                    : isDown
                      ? "border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/[0.04]"
                      : isDegraded
                        ? "border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/[0.04]"
                        : "border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02]"
                )}
              >
                <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                  <span className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
                    {dep.name}
                  </span>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      isOp
                        ? "bg-emerald-500 animate-pulse"
                        : isDown
                          ? "bg-rose-500"
                          : isDegraded
                            ? "bg-amber-500"
                            : "bg-zinc-400 dark:bg-zinc-600"
                    )}
                  />
                  <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate">
                    {isOp
                      ? "Operacional"
                      : isDown
                        ? "Indisponível"
                        : isDegraded
                          ? "Degradado"
                          : "Não configurado"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </AdminSection>
    </div>
  );
}

