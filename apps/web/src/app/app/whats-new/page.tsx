"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Shield, Sparkles, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";

type ReleaseItem = {
  id: string;
  category: string;
  body: string;
  sortOrder: number;
};

type Release = {
  id: string;
  version: string;
  title: string;
  summary?: string | null;
  publishedAt?: string | null;
  seen: boolean;
  items: ReleaseItem[];
};

type ChangelogResponse = {
  items: Release[];
  unseenCount: number;
};

const categoryMeta: Record<
  string,
  { label: string; className: string; icon: typeof Sparkles }
> = {
  NEW: {
    label: "Novo",
    className: "badge-brand",
    icon: Sparkles,
  },
  IMPROVEMENT: {
    label: "Melhoria",
    className: "badge-neutral",
    icon: Wrench,
  },
  FIX: {
    label: "Correção",
    className: "badge-success",
    icon: Wrench,
  },
  SECURITY: {
    label: "Segurança",
    className: "badge-warning",
    icon: Shield,
  },
};

export default function WhatsNewPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const deepReleaseId = searchParams.get("release");
  const [openId, setOpenId] = useState<string | null>(deepReleaseId);

  const { data, isLoading } = useQuery({
    queryKey: ["changelog"],
    queryFn: () => api<ChangelogResponse>("/changelog"),
  });

  const seenMutation = useMutation({
    mutationFn: (payload?: { releaseIds?: string[]; all?: boolean }) =>
      api("/changelog/seen", {
        method: "POST",
        json: payload?.releaseIds
          ? { releaseIds: payload.releaseIds }
          : { all: payload?.all !== false },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["changelog"] });
      void qc.invalidateQueries({ queryKey: ["changelog-unseen"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Deep-link da notificação: destacar release; se não existir (arquivada), lista normal
  useEffect(() => {
    if (!data?.items?.length) return;
    if (deepReleaseId) {
      const found = data.items.find((r) => r.id === deepReleaseId);
      if (found) {
        setOpenId(found.id);
        if (!found.seen && !seenMutation.isPending) {
          seenMutation.mutate({ releaseIds: [found.id] });
        }
        // scroll suave até o card
        window.requestAnimationFrame(() => {
          document
            .getElementById(`release-${found.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }
    }
    if (data.unseenCount > 0 && !seenMutation.isPending) {
      seenMutation.mutate({ all: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.items, data?.unseenCount, deepReleaseId]);

  const items = data?.items || [];
  const grouped = useMemo(() => items, [items]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div data-tour="whats-new-header">
        <PageHeader
          title="Novidades da NexaFlow"
          description="O que mudou na plataforma — em linguagem simples, só o que importa para o seu dia a dia."
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !grouped.length ? (
        <EmptyState
          title="Nenhuma novidade por aqui ainda"
          description="Quando publicarmos melhorias e novos recursos, você verá tudo nesta página."
          icon={<Megaphone className="h-4 w-4" strokeWidth={1.75} />}
        />
      ) : (
        <div className="space-y-3">
          {grouped.map((r, idx) => {
            // Deep-link ou primeira release aberta por padrão
            const open =
              openId === r.id || (openId === null && idx === 0) || deepReleaseId === r.id;
            const byCat = r.items.reduce<Record<string, ReleaseItem[]>>((acc, it) => {
              (acc[it.category] ||= []).push(it);
              return acc;
            }, {});
            return (
              <article
                key={r.id}
                id={`release-${r.id}`}
                className={cn(
                  "card overflow-hidden scroll-mt-20",
                  deepReleaseId === r.id && "ring-2 ring-brand-500/30"
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
                  onClick={() => setOpenId(open ? (idx === 0 && !deepReleaseId ? r.id : null) : r.id)}
                  aria-expanded={open}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge-brand">v{r.version}</span>
                      {!r.seen ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                          Novo
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-1.5 font-display text-[15px] font-semibold text-ink dark:text-white">
                      {r.title}
                    </h2>
                    {r.summary ? (
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                        {r.summary}
                      </p>
                    ) : null}
                    {r.publishedAt ? (
                      <p className="mt-1.5 text-[11.5px] text-ink-faint">
                        {formatDate(r.publishedAt)}
                      </p>
                    ) : null}
                  </div>
                </button>

                {open ? (
                  <div className="space-y-3.5 border-t border-line-soft px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
                    {(["NEW", "IMPROVEMENT", "FIX", "SECURITY"] as const).map((cat) => {
                      const list = byCat[cat];
                      if (!list?.length) return null;
                      const meta = categoryMeta[cat];
                      // No máximo ~7 itens por categoria na UI (defesa se o admin publicar excesso)
                      const shown = list.slice(0, 7);
                      return (
                        <div key={cat}>
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className={cn(meta.className)}>{meta.label}</span>
                          </div>
                          <ul className="space-y-1.5 pl-0.5">
                            {shown.map((it) => (
                              <li
                                key={it.id}
                                className="text-[13px] leading-relaxed text-ink-secondary dark:text-gray-300"
                              >
                                <span className="mr-1.5 text-ink-faint">·</span>
                                {it.body}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {!r.items.length ? (
                      <p className="text-[12.5px] text-ink-faint">
                        Resumo da versão acima. Detalhes em breve.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
