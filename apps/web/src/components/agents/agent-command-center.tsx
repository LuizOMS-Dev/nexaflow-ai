import Link from "next/link";
import {
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  FlaskConical,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentReadiness = {
  agentId: string;
  score: number;
  readyForAuto: boolean;
  fingerprint: string;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    severity: "blocker" | "warning";
    detail: string;
  }>;
  blockers: Array<{
    id: string;
    label: string;
    passed: boolean;
    severity: "blocker" | "warning";
    detail: string;
  }>;
  knowledgeCount: number;
  testCases: number;
  requiredTestCases: number;
  requiredTestsPassed: number;
  lastSandboxTest: {
    result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
    createdAt: string;
    currentConfiguration: boolean;
  } | null;
};

export type AgentOverview = {
  totals: {
    agents: number;
    active: number;
    automatic: number;
    readyForAuto: number;
  };
  provider: {
    configured: boolean;
    id: string | null;
    name: string | null;
    model: string | null;
    modelDisplayName: string | null;
    credentialMode: string | null;
    lastTestedAt: string | null;
    lastTestOk: boolean | null;
  };
  knowledge: { ready: number };
  learning: { openGaps: number; pendingSuggestions: number };
  agents: AgentReadiness[];
};

export type AgentFilter = "all" | "attention" | "active";

function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-black/[0.06] bg-white/80 p-4 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-ink-faint">
            {label}
          </p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-ink dark:text-white">
            {value}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{hint}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/[0.08] text-brand-600 ring-1 ring-inset ring-brand-500/10 dark:text-brand-300">
          {icon}
        </span>
      </div>
    </div>
  );
}

export function AgentCommandCenter({
  overview,
  isLoading,
  hasError,
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: {
  overview?: AgentOverview;
  isLoading: boolean;
  hasError?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  filter: AgentFilter;
  onFilterChange: (value: AgentFilter) => void;
}) {
  const reviewCount =
    (overview?.learning.openGaps || 0) + (overview?.learning.pendingSuggestions || 0);
  const providerHealthy =
    overview?.provider.configured === true && overview.provider.lastTestOk !== false;

  return (
    <section className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-gradient-to-br from-white via-white to-brand-50/40 shadow-[0_14px_40px_-28px_rgba(38,51,77,0.45)] dark:border-white/[0.08] dark:from-[#151922] dark:via-[#12161e] dark:to-brand-950/20">
      <div className="grid gap-5 border-b border-black/[0.055] px-5 py-5 dark:border-white/[0.065] lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
            <BrainCircuit className="h-4 w-4" strokeWidth={1.8} />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em]">
              Centro de operação
            </span>
          </div>
          <h2 className="mt-2 font-display text-xl font-semibold tracking-[-0.035em] text-ink dark:text-white">
            Agentes seguros, testáveis e prontos para trabalhar
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
            Acompanhe configuração, conhecimento e testes antes de permitir respostas automáticas.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/app/ai/quality" className="btn-secondary h-8 px-3 text-xs">
              <FlaskConical className="h-3.5 w-3.5" /> Qualidade e testes
            </Link>
            <Link href="/app/ai/learning" className="btn-secondary h-8 px-3 text-xs">
              <Sparkles className="h-3.5 w-3.5" /> Aprendizado
            </Link>
            <Link href="/app/knowledge" className="btn-ghost h-8 px-3 text-xs">
              <BookOpen className="h-3.5 w-3.5" /> Conhecimento
            </Link>
          </div>
        </div>

        <div
          className={cn(
            "rounded-2xl border p-4",
            providerHealthy
              ? "border-emerald-500/20 bg-emerald-500/[0.055]"
              : "border-amber-500/25 bg-amber-500/[0.06]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-ink-faint">
                Provedor de IA
              </p>
              <p className="mt-1.5 truncate text-sm font-semibold text-ink dark:text-white">
                {isLoading
                  ? "Verificando…"
                  : hasError
                    ? "Status indisponível"
                  : overview?.provider.configured
                    ? overview.provider.name || "Configurado"
                    : "Configuração necessária"}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                {hasError
                  ? "Atualize a página para tentar consultar novamente."
                  : overview?.provider.configured
                  ? overview.provider.modelDisplayName || overview.provider.model || "Modelo padrão"
                  : "Conecte um provedor antes de testar e ativar agentes."}
              </p>
            </div>
            {providerHealthy ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
            ) : (
              <Settings2 className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            )}
          </div>
          <Link
            href="/app/settings"
            className="mt-3 inline-flex text-[11.5px] font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            Abrir configurações de IA →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <Metric
          label="Prontos para automático"
          value={isLoading || hasError ? "—" : `${overview?.totals.readyForAuto || 0}/${overview?.totals.agents || 0}`}
          hint="Configuração aprovada em todos os controles"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <Metric
          label="Agentes ativos"
          value={isLoading || hasError ? "—" : overview?.totals.active || 0}
          hint="Em qualquer modo de operação"
          icon={<Bot className="h-4 w-4" />}
        />
        <Metric
          label="Fontes prontas"
          value={isLoading || hasError ? "—" : overview?.knowledge.ready || 0}
          hint="Conhecimento disponível para respostas"
          icon={<BookOpen className="h-4 w-4" />}
        />
        <Metric
          label="Revisões pendentes"
          value={isLoading || hasError ? "—" : reviewCount}
          hint="Lacunas e sugestões aguardando decisão humana"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-black/[0.055] px-5 py-4 dark:border-white/[0.065] sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <label className="relative block min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar agentes</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="input h-9 pl-9 text-xs"
            placeholder="Buscar por nome, função ou objetivo"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" aria-label="Filtrar agentes">
          {(
            [
              ["all", "Todos"],
              ["attention", "Precisam de atenção"],
              ["active", "Ativos"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => onFilterChange(value)}
              className={cn(
                "h-8 rounded-lg border px-3 text-[11.5px] font-semibold transition-colors",
                filter === value
                  ? "border-brand-500/25 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                  : "border-line bg-white text-ink-muted hover:border-brand-500/20 hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
