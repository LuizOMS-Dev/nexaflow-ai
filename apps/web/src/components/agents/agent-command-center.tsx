import Link from "next/link";
import {
  BookOpen,
  Bot,
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
    <div className="min-w-0 rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] p-4 dark:border-white/[0.07]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink-faint dark:text-zinc-500">{label}</p>
          <p className="mt-1.5 font-display text-[1.5rem] font-semibold tracking-[-0.04em] text-ink dark:text-white">
            {value}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint dark:text-zinc-500">
            {hint}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/[0.1] text-violet-600 dark:text-violet-300">
          {icon}
        </span>
      </div>
    </div>
  );
}

/**
 * Toolbar + métricas da página de agentes — visual alinhado ao restante do app.
 */
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
    <div className="space-y-4">
      {/* Status do provedor — banner compacto */}
      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
          providerHealthy
            ? "border-emerald-500/20 bg-emerald-500/[0.06]"
            : "border-amber-500/25 bg-amber-500/[0.07]"
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {providerHealthy ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          ) : (
            <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink dark:text-white">
              {isLoading
                ? "Verificando provedor…"
                : hasError
                  ? "Status do provedor indisponível"
                  : overview?.provider.configured
                    ? overview.provider.name || "Provedor configurado"
                    : "Provedor de IA necessário"}
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted dark:text-zinc-400">
              {hasError
                ? "Atualize a página para tentar novamente."
                : overview?.provider.configured
                  ? overview.provider.modelDisplayName ||
                    overview.provider.model ||
                    "Modelo padrão"
                  : "Conecte um provedor em Configurações antes de ativar respostas automáticas."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Link href="/app/settings" className="btn-secondary h-8 px-3 text-xs">
            <Settings2 className="h-3.5 w-3.5" strokeWidth={1.7} />
            Config. de IA
          </Link>
          <Link href="/app/ai/quality" className="btn-ghost h-8 px-3 text-xs">
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.7} />
            Qualidade
          </Link>
          <Link href="/app/ai/learning" className="btn-ghost h-8 px-3 text-xs">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
            Aprendizado
          </Link>
          <Link href="/app/knowledge" className="btn-ghost h-8 px-3 text-xs">
            <BookOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
            Conhecimento
          </Link>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Prontos p/ automático"
          value={
            isLoading || hasError
              ? "—"
              : `${overview?.totals.readyForAuto || 0}/${overview?.totals.agents || 0}`
          }
          hint="Controles aprovados"
          icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.7} />}
        />
        <Metric
          label="Agentes ativos"
          value={isLoading || hasError ? "—" : overview?.totals.active || 0}
          hint="Em qualquer modo"
          icon={<Bot className="h-4 w-4" strokeWidth={1.7} />}
        />
        <Metric
          label="Fontes prontas"
          value={isLoading || hasError ? "—" : overview?.knowledge.ready || 0}
          hint="Conhecimento disponível"
          icon={<BookOpen className="h-4 w-4" strokeWidth={1.7} />}
        />
        <Metric
          label="Revisões pendentes"
          value={isLoading || hasError ? "—" : reviewCount}
          hint="Lacunas e sugestões"
          icon={<Sparkles className="h-4 w-4" strokeWidth={1.7} />}
        />
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] p-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.07]">
        <label className="relative block min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar agentes</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="input h-9 pl-9 text-[13px]"
            placeholder="Buscar por nome, função ou objetivo"
          />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="Filtrar agentes">
          {(
            [
              ["all", "Todos"],
              ["attention", "Atenção"],
              ["active", "Ativos"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => onFilterChange(value)}
              className={cn(
                "h-8 rounded-lg px-3 text-[12px] font-medium transition-colors",
                filter === value
                  ? "bg-violet-500/12 text-violet-700 dark:bg-violet-500/18 dark:text-violet-200"
                  : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
