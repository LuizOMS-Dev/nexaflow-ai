"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, BookOpen, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  FormField,
  Modal,
  Spinner,
  useToast,
} from "@/components/ui";
import { TenantMetric, TenantPage, TenantSection } from "@/components/tenant/tenant-page";
import { NiaMarkdown } from "@/components/nexaflow-assistant/nia-markdown";

type CompanySettings = {
  settings?: {
    continuousLearning?: { enabled?: boolean; level?: number };
  };
};

type Gap = {
  id: string;
  question: string;
  occurrences: number;
  status: string;
  lastSeenAt: string;
  agentId?: string | null;
};

type Suggestion = {
  id: string;
  title: string;
  content: string;
  kind: string;
  status: string;
  occurrences: number;
  createdAt: string;
};

const gapStatusLabel: Record<string, string> = {
  NEW: "Nova",
  REVIEWING: "Em análise",
  RESOLVED: "Resolvida",
  IGNORED: "Ignorada",
};

export default function AgentLearningPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [review, setReview] = useState<{
    kind: "gap" | "suggestion";
    id: string;
    title: string;
    content: string;
  } | null>(null);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<CompanySettings>("/settings"),
    staleTime: 30_000,
  });

  const learningOn =
    settings.data?.settings?.continuousLearning?.enabled === true;

  const gaps = useQuery({
    queryKey: ["knowledge-gaps"],
    queryFn: () => api<Gap[]>("/knowledge-gaps"),
    enabled: learningOn,
  });

  const suggestions = useQuery({
    queryKey: ["learning-suggestions"],
    queryFn: () => api<Suggestion[]>("/learning-suggestions?status=PENDING"),
    enabled: learningOn,
  });

  const patchGap = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/knowledge-gaps/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-gaps"] });
      toast({ kind: "success", title: "Lacuna atualizada" });
    },
    onError: (error: Error) =>
      toast({ kind: "error", title: "Não foi possível atualizar", description: error.message }),
  });

  const patchSug = useMutation({
    mutationFn: ({
      id,
      status,
      content,
    }: {
      id: string;
      status: string;
      content?: string;
    }) =>
      api(`/learning-suggestions/${id}`, {
        method: "PATCH",
        json: { status, content, publishKnowledge: status === "APPROVED" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-suggestions"] });
      qc.invalidateQueries({ queryKey: ["knowledge-gaps"] });
      qc.invalidateQueries({ queryKey: ["ai-agents-overview"] });
      setReview(null);
      toast({ kind: "success", title: "Sugestão atualizada" });
    },
    onError: (error: Error) =>
      toast({ kind: "error", title: "Não foi possível atualizar", description: error.message }),
  });

  const toKnowledge = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api(`/knowledge-gaps/${id}/to-knowledge`, {
        method: "POST",
        json: { content },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-gaps"] });
      qc.invalidateQueries({ queryKey: ["ai-agents-overview"] });
      setReview(null);
      toast({ kind: "success", title: "Conhecimento publicado" });
    },
    onError: (error: Error) =>
      toast({ kind: "error", title: "Não foi possível publicar", description: error.message }),
  });

  const pendingReview = toKnowledge.isPending || patchSug.isPending;

  const openGapsCount =
    gaps.data?.filter((gap) => gap.status === "NEW" || gap.status === "REVIEWING").length || 0;

  return (
    <TenantPage
      eyebrow="Agentes"
      title="Aprendizado"
      description="Revise lacunas e sugestões antes de publicar qualquer conteúdo na base da empresa."
      actions={
        <Link href="/app/ai" className="btn-secondary h-9 px-3 text-[13px]">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
          Voltar
        </Link>
      }
    >
      {!settings.isLoading && !learningOn ? (
        <TenantSection>
          <div className="px-1 py-6 text-center">
            <p className="text-[15px] font-semibold text-ink dark:text-white">
              Aprendizado desativado
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-muted dark:text-zinc-400">
              Ative o aprendizado contínuo em Configurações → IA para coletar lacunas e
              sugestões a partir das conversas.
            </p>
            <Link href="/app/settings" className="btn-primary mt-4 inline-flex h-9 px-4">
              Abrir configurações de IA
            </Link>
          </div>
        </TenantSection>
      ) : null}

      {learningOn ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TenantMetric
              label="Lacunas abertas"
              value={gaps.isLoading ? "—" : openGapsCount}
              hint="Perguntas sem resposta confiável"
            />
            <TenantMetric
              label="Sugestões para revisar"
              value={suggestions.isLoading ? "—" : suggestions.data?.length || 0}
              hint="Rascunhos da IA aguardando você"
            />
          </div>

          <TenantSection
            flush
            title="Lacunas de conhecimento"
            action={
              openGapsCount > 0 ? (
                <span className="badge-warning shrink-0">{openGapsCount}</span>
              ) : null
            }
          >
            {gaps.isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : !gaps.data?.length ? (
              <div className="px-2 py-4">
                <EmptyState
                  icon={<BookOpen className="h-5 w-5" strokeWidth={1.5} />}
                  title="Nenhuma lacuna detectada"
                  description="Quando o agente não souber responder com segurança, a pergunta aparece aqui para revisão."
                />
              </div>
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {gaps.data.map((g) => (
                  <li key={g.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-ink dark:text-white">
                          {g.question}
                        </p>
                        <p className="mt-1 text-[12px] text-ink-faint dark:text-zinc-500">
                          {g.occurrences} ocorrência{g.occurrences === 1 ? "" : "s"}
                          {" · "}
                          {formatDate(g.lastSeenAt)}
                          {" · "}
                          {gapStatusLabel[g.status] || g.status}
                        </p>
                      </div>
                    </div>
                    {g.status === "NEW" || g.status === "REVIEWING" ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="btn-primary btn-sm h-8"
                          onClick={() => {
                            setReview({
                              kind: "gap",
                              id: g.id,
                              title: "Revisar novo conhecimento",
                              content: g.question,
                            });
                          }}
                        >
                          Adicionar conhecimento
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm h-8"
                          onClick={() => patchGap.mutate({ id: g.id, status: "IGNORED" })}
                        >
                          Ignorar
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </TenantSection>

          <TenantSection
            flush
            title="Sugestões de aprendizado"
            action={
              suggestions.data?.length ? (
                <span className="badge-brand shrink-0">{suggestions.data.length}</span>
              ) : null
            }
          >
            {suggestions.isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : !suggestions.data?.length ? (
              <div className="px-2 py-4">
                <EmptyState
                  icon={<Sparkles className="h-5 w-5" strokeWidth={1.5} />}
                  title="Nenhuma sugestão pendente"
                  description="Sugestões aprovadas viram conhecimento da empresa. Nada é publicado sem a sua confirmação."
                />
              </div>
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {suggestions.data.map((s) => (
                  <li key={s.id} className="px-4 py-3.5">
                    <p className="text-[13.5px] font-medium text-ink dark:text-white">{s.title}</p>
                    <div className="mt-2 line-clamp-5 text-[13px] leading-relaxed text-ink-muted dark:text-zinc-400">
                      <NiaMarkdown content={s.content} />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-faint dark:text-zinc-500">
                      {s.kind} · {formatDate(s.createdAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="btn-primary btn-sm h-8"
                        onClick={() =>
                          setReview({
                            kind: "suggestion",
                            id: s.id,
                            title: s.title,
                            content: s.content,
                          })
                        }
                      >
                        Revisar e aprovar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm h-8"
                        onClick={() => patchSug.mutate({ id: s.id, status: "REJECTED" })}
                      >
                        Rejeitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TenantSection>
        </>
      ) : null}

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={review?.title || "Revisar conhecimento"}
        description="Edite o texto abaixo. Ele só será publicado depois da sua confirmação."
        icon={<BookOpen className="h-4 w-4" />}
        size="lg"
        variant="contextual"
        preventClose={pendingReview}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setReview(null)}
              disabled={pendingReview}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pendingReview || !review?.content.trim()}
              onClick={() => {
                if (!review?.content.trim()) return;
                if (review.kind === "gap") {
                  toKnowledge.mutate({ id: review.id, content: review.content.trim() });
                } else {
                  patchSug.mutate({
                    id: review.id,
                    status: "APPROVED",
                    content: review.content.trim(),
                  });
                }
              }}
            >
              {pendingReview ? <Spinner className="h-3.5 w-3.5" /> : null}
              Confirmar e publicar
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4 pb-2">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.055] px-3.5 py-3 text-[12px] leading-relaxed text-amber-950 dark:text-amber-100">
            Confirme fatos, preços, políticas e prazos. Conteúdo gerado pela IA pode estar
            incompleto.
          </div>
          <FormField
            label="Conteúdo final"
            htmlFor="learning-review-content"
            required
            hint="Este texto ficará disponível para os agentes na base de conhecimento."
          >
            <textarea
              id="learning-review-content"
              className="textarea min-h-56"
              value={review?.content || ""}
              maxLength={12_000}
              onChange={(event) =>
                setReview((current) =>
                  current ? { ...current, content: event.target.value } : current
                )
              }
            />
          </FormField>
        </div>
      </Modal>
    </TenantPage>
  );
}
