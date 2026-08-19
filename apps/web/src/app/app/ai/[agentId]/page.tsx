"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  FlaskConical,
  History,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { TenantPage, TenantSection } from "@/components/tenant/tenant-page";

type Agent = {
  id: string;
  name: string;
  role?: string | null;
  objective?: string | null;
  mode: string;
  isActive: boolean;
  model?: string;
  currentVersion?: number;
  publishStatus?: string;
  updatedAt?: string;
  tools?: { allowed?: string[] } | null;
};

type Metrics = {
  periodDays: number;
  aiResponses: number;
  toolSuccess: number;
  toolFailed: number;
  feedbackUp: number;
  feedbackDown: number;
  knowledgeGaps: number;
  handoffs: number;
  pendingApprovals: number;
};

type KnowledgeItem = {
  id: string;
  title: string;
  status?: string;
  category?: string | null;
};

type VersionRow = {
  id: string;
  version: number;
  changeNote?: string | null;
  createdAt: string;
};

const MODE_LABEL: Record<string, string> = {
  AUTO: "Automático",
  APPROVE: "Aprovação",
  SUGGEST: "Copiloto",
};

const TABS = [
  { id: "overview", label: "Visão geral", icon: Bot },
  { id: "knowledge", label: "Conhecimento", icon: BookOpen },
  { id: "versions", label: "Versões", icon: History },
  { id: "ops", label: "Operação", icon: Settings2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = String(params.agentId || "");
  const [tab, setTab] = useState<TabId>("overview");

  const agentQ = useQuery({
    queryKey: ["ai-agent", agentId],
    queryFn: () => api<Agent>(`/ai-agents/${agentId}`),
    enabled: Boolean(agentId),
  });

  const metricsQ = useQuery({
    queryKey: ["ai-agent-metrics", agentId],
    queryFn: () => api<Metrics>(`/ai-agents/${agentId}/metrics?days=30`),
    enabled: Boolean(agentId),
  });

  const knowledgeQ = useQuery({
    queryKey: ["ai-agent-knowledge", agentId],
    queryFn: () => api<{ items?: KnowledgeItem[] } | KnowledgeItem[]>(`/ai-agents/${agentId}/knowledge`),
    enabled: Boolean(agentId) && tab === "knowledge",
  });

  const versionsQ = useQuery({
    queryKey: ["ai-agent-versions", agentId],
    queryFn: () => api<VersionRow[]>(`/ai-agents/${agentId}/versions`),
    enabled: Boolean(agentId) && tab === "versions",
  });

  const knowledgeItems = useMemo(() => {
    const d = knowledgeQ.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    return d.items || [];
  }, [knowledgeQ.data]);

  if (agentQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (agentQ.isError || !agentQ.data) {
    return (
      <TenantPage
        eyebrow="Agentes"
        title="Agente não encontrado"
        description="Este agente pode ter sido excluído ou você não tem acesso."
        actions={
          <Link href="/app/ai" className="btn-secondary h-9 px-3 text-[13px]">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
            Voltar
          </Link>
        }
      >
        <TenantSection>
          <div className="py-6 text-center">
            <p className="text-[13px] text-ink-muted dark:text-zinc-400">
              Confira a lista de agentes da empresa.
            </p>
            <Link href="/app/ai" className="btn-primary mt-4 inline-flex h-9 px-4">
              Ver agentes
            </Link>
          </div>
        </TenantSection>
      </TenantPage>
    );
  }

  const agent = agentQ.data;
  const m = metricsQ.data;

  return (
    <TenantPage
      eyebrow="Agentes"
      title={agent.name}
      description={
        agent.objective?.trim() ||
        agent.role ||
        "Central do agente — visão operacional e atalhos."
      }
      maxWidth="wide"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary h-9 px-3 text-[13px]"
            onClick={() => router.push("/app/ai")}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
            Lista
          </button>
          <Link href={`/app/ai?open=${agent.id}`} className="btn-secondary h-9 px-3 text-[13px]">
            Editar
          </Link>
          <Link href="/app/ai/quality" className="btn-secondary h-9 px-3 text-[13px]">
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.7} />
            Qualidade
          </Link>
          <Link href={`/app/ai?open=${agent.id}&test=1`} className="btn-primary h-9 px-3 text-[13px]">
            Testar
          </Link>
        </div>
      }
    >
      {/* Status strip — prioritiza status/modo/função, não modelo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(agent.isActive ? "badge-success" : "badge-neutral")}>
          {agent.isActive ? "Ativo" : "Pausado"}
        </span>
        <span className="inline-flex rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
          {MODE_LABEL[agent.mode] || agent.mode}
        </span>
        {agent.role ? (
          <span className="text-[12px] text-ink-muted dark:text-zinc-400">{agent.role}</span>
        ) : null}
        {agent.publishStatus ? (
          <span className="inline-flex rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-white/[0.06] dark:text-zinc-400">
            {agent.publishStatus === "PUBLISHED"
              ? "Publicado"
              : agent.publishStatus === "DRAFT"
                ? "Rascunho"
                : agent.publishStatus === "ARCHIVED"
                  ? "Arquivado"
                  : agent.publishStatus}
          </span>
        ) : null}
        {agent.currentVersion ? (
          <span className="text-[12px] text-ink-faint dark:text-zinc-500">
            v{agent.currentVersion}
          </span>
        ) : null}
      </div>

      {/* Tabs */}
      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border border-black/[0.06] bg-[var(--surface-raised)] p-1 dark:border-white/[0.07]"
        aria-label="Áreas do agente"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-violet-500/12 text-violet-700 dark:bg-violet-500/18 dark:text-violet-200"
                  : "text-ink-muted hover:bg-black/[0.03] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.04]"
              )}
            >
              <Icon className="h-3.5 w-3.5 opacity-80" strokeWidth={1.7} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Respostas (30d)",
                value: metricsQ.isLoading ? "—" : m?.aiResponses ?? 0,
                icon: Sparkles,
              },
              {
                label: "Handoffs",
                value: metricsQ.isLoading ? "—" : m?.handoffs ?? 0,
                icon: ShieldCheck,
              },
              {
                label: "Ações OK / falha",
                value: metricsQ.isLoading
                  ? "—"
                  : `${m?.toolSuccess ?? 0}/${m?.toolFailed ?? 0}`,
                icon: Settings2,
              },
              {
                label: "Aprovações pendentes",
                value: metricsQ.isLoading ? "—" : m?.pendingApprovals ?? 0,
                icon: FlaskConical,
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] p-4 dark:border-white/[0.07]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-medium text-ink-faint dark:text-zinc-500">
                        {card.label}
                      </p>
                      <p className="mt-1.5 font-display text-xl font-semibold tracking-tight text-ink dark:text-white">
                        {card.value}
                      </p>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                      <Icon className="h-4 w-4" strokeWidth={1.7} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <TenantSection title="Resumo operacional">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] text-ink-faint dark:text-zinc-500">Função</dt>
                <dd className="mt-0.5 text-[13px] text-ink dark:text-zinc-200">
                  {agent.role || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-faint dark:text-zinc-500">Modo</dt>
                <dd className="mt-0.5 text-[13px] text-ink dark:text-zinc-200">
                  {MODE_LABEL[agent.mode] || agent.mode}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-faint dark:text-zinc-500">Status</dt>
                <dd className="mt-0.5 text-[13px] text-ink dark:text-zinc-200">
                  {agent.isActive ? "Ativo" : "Pausado"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-faint dark:text-zinc-500">Atualizado</dt>
                <dd className="mt-0.5 text-[13px] text-ink dark:text-zinc-200">
                  {agent.updatedAt
                    ? new Date(agent.updatedAt).toLocaleString("pt-BR")
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
              Para editar comportamento, handoff e ações, use o editor na lista de agentes.
              Testes ficam em Qualidade; documentos em Conhecimento.
            </p>
          </TenantSection>
        </div>
      )}

      {tab === "knowledge" && (
        <TenantSection
          title="Fontes vinculadas"
          action={
            <Link href="/app/knowledge" className="btn-secondary h-8 px-3 text-xs">
              Abrir base
            </Link>
          }
        >
          {knowledgeQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : knowledgeItems.length === 0 ? (
            <p className="text-[13px] text-ink-muted dark:text-zinc-400">
              Nenhuma fonte exclusiva listada. Documentos com escopo “todos os agentes” também
              alimentam este agente em tempo de execução.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {knowledgeItems.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink dark:text-zinc-100">
                      {k.title}
                    </p>
                    <p className="text-[11px] text-ink-faint dark:text-zinc-500">
                      {[k.category, k.status].filter(Boolean).join(" · ") || "Documento"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TenantSection>
      )}

      {tab === "versions" && (
        <TenantSection title="Histórico de versões">
          {versionsQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !versionsQ.data?.length ? (
            <p className="text-[13px] text-ink-muted dark:text-zinc-400">
              Nenhuma versão publicada ainda. Salvar alterações relevantes gera snapshots.
            </p>
          ) : (
            <ul className="space-y-2">
              {versionsQ.data.map((v) => (
                <li
                  key={v.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-ink dark:text-white">
                      Versão {v.version}
                      {v.version === agent.currentVersion ? (
                        <span className="ml-2 text-[11px] font-medium text-violet-600 dark:text-violet-300">
                          atual
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted dark:text-zinc-400">
                      {v.changeNote || "Snapshot de configuração"}
                    </p>
                  </div>
                  <time className="shrink-0 text-[11px] text-ink-faint dark:text-zinc-500">
                    {new Date(v.createdAt).toLocaleString("pt-BR")}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </TenantSection>
      )}

      {tab === "ops" && (
        <TenantSection title="Atalhos de operação">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href="/app/ai"
              className="rounded-xl border border-black/[0.06] px-4 py-3 text-[13px] font-medium transition-colors hover:bg-black/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.03]"
            >
              Lista e editor de agentes
            </Link>
            <Link
              href="/app/ai/quality"
              className="rounded-xl border border-black/[0.06] px-4 py-3 text-[13px] font-medium transition-colors hover:bg-black/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.03]"
            >
              Casos de teste e prontidão
            </Link>
            <Link
              href="/app/ai/learning"
              className="rounded-xl border border-black/[0.06] px-4 py-3 text-[13px] font-medium transition-colors hover:bg-black/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.03]"
            >
              Aprendizado supervisionado
            </Link>
            <Link
              href="/app/settings"
              className="rounded-xl border border-black/[0.06] px-4 py-3 text-[13px] font-medium transition-colors hover:bg-black/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.03]"
            >
              Configurações de IA
            </Link>
            <Link
              href="/app/inbox"
              className="rounded-xl border border-black/[0.06] px-4 py-3 text-[13px] font-medium transition-colors hover:bg-black/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.03]"
            >
              Conversas (rascunhos e aprovações)
            </Link>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-muted dark:text-zinc-400">
            Feedback da equipe: {m?.feedbackUp ?? 0} positivos / {m?.feedbackDown ?? 0}{" "}
            negativos nos últimos {m?.periodDays ?? 30} dias. Lacunas de conhecimento:{" "}
            {m?.knowledgeGaps ?? 0}.
          </p>
        </TenantSection>
      )}
    </TenantPage>
  );
}
