"use client";

import { useState } from "react";
import {
  User,
  Phone,
  Mail,
  Tag,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Bot,
  Hourglass,
  Clock,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  StickyNote,
  Layers,
  ArrowRightLeft,
} from "lucide-react";
import { cn, commercialStatusLabel, formatDate, initials, leadPriorityLabel, statusLabel } from "@/lib/utils";
import { formatPhone, getContactDisplayName } from "@/lib/format-contact";

export type InboxContextPanelProps = {
  conversation: any;
  score: number;
  scorePct: number;
  ai?: any;
  onTransfer?: () => void;
  onToggleAi?: () => void;
  canTransfer?: boolean;
};

export function InboxContextPanel({
  conversation,
  score,
  scorePct,
  ai,
  onTransfer,
  onToggleAi,
  canTransfer = true,
}: InboxContextPanelProps) {
  const [atendimentoOpen, setAtendimentoOpen] = useState(true);
  const [comercialOpen, setComercialOpen] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [scoreDetailsOpen, setScoreDetailsOpen] = useState(false);

  const contact = conversation.contact;
  const breakdown = Array.isArray(contact?.scoreBreakdown) ? contact.scoreBreakdown : [];

  const handoffKind = (() => {
    if (conversation.status === "CLOSED" || conversation.status === "ARCHIVED") return "closed";
    if (conversation.status === "PENDING" && !conversation.assignedTo) return "pending";
    if (conversation.assignedTo) return "human";
    return "ai";
  })();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white dark:bg-[#0c0e14]">
      {/* 1. Header do Perfil do Contato */}
      <div className="border-b border-black/[0.06] p-4 dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
            {initials(getContactDisplayName(contact))}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-[14px] font-semibold text-ink dark:text-zinc-100">
              {getContactDisplayName(contact)}
            </h3>
            <p className="truncate text-xs text-ink-muted dark:text-zinc-400">
              {formatPhone(contact.phone) || "Sem telefone"}
            </p>
            {contact.email && (
              <p className="truncate text-[11px] text-ink-faint dark:text-zinc-500">
                {contact.email}
              </p>
            )}
          </div>
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {contact.tags.map((t: any) => (
              <span
                key={t.tag.id}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs"
                style={{ background: t.tag.color || "#8b5cf6" }}
              >
                {t.tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Accordions Contextuais */}
      <div className="flex-1 divide-y divide-black/[0.05] dark:divide-white/[0.05]">
        {/* 2. Seção: Atendimento */}
        <div>
          <button
            type="button"
            onClick={() => setAtendimentoOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-[12px] font-semibold tracking-tight text-ink dark:text-zinc-200">
              Atendimento
            </span>
            {atendimentoOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-ink-muted dark:text-zinc-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ink-muted dark:text-zinc-500" />
            )}
          </button>

          {atendimentoOpen && (
            <div className="space-y-2 px-4 pb-4 pt-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted dark:text-zinc-500">Estado</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-[11px]",
                    handoffKind === "ai" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                    handoffKind === "human" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                    handoffKind === "pending" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
                    handoffKind === "closed" && "bg-black/5 text-ink-muted dark:bg-white/5 dark:text-zinc-400"
                  )}
                >
                  {handoffKind === "ai" && <Bot className="h-3 w-3" />}
                  {handoffKind === "human" && <User className="h-3 w-3" />}
                  {handoffKind === "pending" && <Hourglass className="h-3 w-3" />}
                  {handoffKind === "ai"
                    ? "IA atendendo"
                    : handoffKind === "human"
                      ? conversation.assignedTo?.name || "Atendente"
                      : handoffKind === "pending"
                        ? "Aguardando"
                        : "Encerrada"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-muted dark:text-zinc-500">Canal</span>
                <span className="font-medium text-ink dark:text-zinc-200">
                  {conversation.channel?.name || "WhatsApp"}
                </span>
              </div>

              {conversation.lastMessageAt && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted dark:text-zinc-500">Última msg</span>
                  <span className="tabular-nums text-ink-secondary dark:text-zinc-400">
                    {formatDate(conversation.lastMessageAt)}
                  </span>
                </div>
              )}

              {/* Notas Internas */}
              {conversation.notes && conversation.notes.length > 0 && (
                <div className="mt-3 space-y-1.5 pt-2 border-t border-black/[0.04] dark:border-white/[0.04]">
                  <span className="text-[11px] font-medium text-ink-muted dark:text-zinc-500">
                    Notas da equipe
                  </span>
                  {conversation.notes.map((n: any) => (
                    <div
                      key={n.id}
                      className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2 text-[11.5px] dark:bg-amber-500/[0.06]"
                    >
                      <p className="leading-snug text-ink-secondary dark:text-zinc-200">{n.content}</p>
                      <p className="mt-1 text-[9.5px] text-ink-faint dark:text-zinc-500">
                        {n.author?.name} · {formatDate(n.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Seção: Comercial */}
        <div>
          <button
            type="button"
            onClick={() => setComercialOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-[12px] font-semibold tracking-tight text-ink dark:text-zinc-200">
              Comercial
            </span>
            {comercialOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-ink-muted dark:text-zinc-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ink-muted dark:text-zinc-500" />
            )}
          </button>

          {comercialOpen && (
            <div className="space-y-3 px-4 pb-4 pt-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted dark:text-zinc-500">Status</span>
                <span className="font-medium text-ink dark:text-zinc-200">
                  {commercialStatusLabel[contact.commercialStatus || ""] || "Sem status"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-muted dark:text-zinc-500">Prioridade</span>
                <span className="font-medium text-ink dark:text-zinc-200">
                  {leadPriorityLabel[contact.priority || ""] || contact.priority || "Normal"}
                </span>
              </div>

              {/* Score com barra de progresso única */}
              <div className="rounded-lg bg-black/[0.02] p-2.5 dark:bg-white/[0.02] border border-black/[0.04] dark:border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-medium text-ink-muted dark:text-zinc-400">
                    Lead Score
                  </span>
                  <span className="tabular-nums font-semibold text-violet-700 dark:text-violet-300">
                    {score}/100
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-600 dark:bg-violet-500 transition-all duration-300"
                    style={{ width: `${scorePct}%` }}
                  />
                </div>

                {breakdown.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.04]">
                    <button
                      type="button"
                      onClick={() => setScoreDetailsOpen((v) => !v)}
                      className="flex w-full items-center justify-between text-[10.5px] text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      <span>Critérios do score</span>
                      <span>{scoreDetailsOpen ? "Ocultar" : "Ver"}</span>
                    </button>
                    {scoreDetailsOpen && (
                      <ul className="mt-1.5 space-y-1 text-[10px]">
                        {breakdown.map((b: any, i: number) => (
                          <li key={i} className="flex justify-between text-ink-faint dark:text-zinc-400">
                            <span>{b.label}</span>
                            <span className="tabular-nums font-medium text-violet-600 dark:text-violet-300">
                              {b.delta && b.delta > 0 ? `+${b.delta}` : b.delta}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Próxima Ação */}
              {contact.nextAction && (
                <div className="rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-2.5 dark:bg-violet-500/[0.05]">
                  <p className="text-[10.5px] font-semibold text-violet-800 dark:text-violet-300">
                    Próxima Ação Recomendada
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink dark:text-zinc-200">
                    {contact.nextAction}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Seção: Insights de IA */}
        <div>
          <button
            type="button"
            onClick={() => setInsightsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              <span className="text-[12px] font-semibold tracking-tight text-ink dark:text-zinc-200">
                Insights da IA
              </span>
            </div>
            {insightsOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-ink-muted dark:text-zinc-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ink-muted dark:text-zinc-500" />
            )}
          </button>

          {insightsOpen && (
            <div className="space-y-2.5 px-4 pb-4 pt-1 text-xs">
              {(conversation.aiSummary || contact.memory?.summary) && (
                <div>
                  <p className="text-[11px] font-medium text-ink-muted dark:text-zinc-400">
                    Resumo do Contexto
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary dark:text-zinc-300">
                    {conversation.aiSummary || contact.memory?.summary}
                  </p>
                </div>
              )}

              {conversation.aiIntent && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted dark:text-zinc-500">Intenção</span>
                  <span className="font-medium text-ink dark:text-zinc-200">
                    {conversation.aiIntent}
                  </span>
                </div>
              )}

              {conversation.aiSentiment && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted dark:text-zinc-500">Sentimento</span>
                  <span className="font-medium text-ink dark:text-zinc-200">
                    {conversation.aiSentiment}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
