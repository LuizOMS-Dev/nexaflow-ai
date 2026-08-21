"use client";

import { Clock, Star, Bot, User, Hourglass } from "lucide-react";
import { cn, initials, leadPriorityLabel } from "@/lib/utils";
import { getContactDisplayName } from "@/lib/format-contact";

export type InboxConversationItemProps = {
  conversation: any;
  selected: boolean;
  onSelect: () => void;
  userId?: string;
};

export function InboxConversationItem({
  conversation: c,
  selected,
  onSelect,
  userId,
}: InboxConversationItemProps) {
  const isMine = c.assignedTo?.id === userId;
  const handoffKind = (() => {
    if (c.status === "CLOSED" || c.status === "ARCHIVED") return "closed";
    if (c.status === "PENDING" && !c.assignedTo) return "pending";
    if (c.assignedTo) return "human";
    return "ai";
  })();

  const formatMsgTime = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const displayName = getContactDisplayName(c.contact);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-all duration-150 border-b border-black/[0.035] dark:border-white/[0.035]",
        selected
          ? "bg-violet-500/[0.08] dark:bg-violet-500/[0.12]"
          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
        c.isUnread && !selected && "bg-black/[0.012] dark:bg-white/[0.015]"
      )}
    >
      {/* Indicador de Seleção Ativa */}
      {selected && (
        <span
          className="absolute bottom-1.5 left-0 top-1.5 w-[2.5px] rounded-full bg-violet-600 dark:bg-violet-400"
          aria-hidden
        />
      )}

      {/* Avatar do Contato */}
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
            handoffKind === "pending"
              ? "bg-amber-500/15 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100"
              : c.isUnread
                ? "bg-violet-500/15 text-violet-900 dark:bg-violet-400/20 dark:text-violet-100"
                : "bg-black/[0.04] text-ink-secondary dark:bg-white/10 dark:text-zinc-300"
          )}
        >
          {initials(displayName)}
        </div>
        {c.isUnread && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-violet-600 dark:border-[#0e1117] dark:bg-violet-400" />
        )}
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1.5">
          <p
            className={cn(
              "truncate text-[12.5px] text-ink dark:text-zinc-100",
              c.isUnread || handoffKind === "pending" ? "font-semibold" : "font-medium"
            )}
          >
            {displayName}
          </p>
          <span className="shrink-0 text-[10px] tabular-nums text-ink-faint dark:text-zinc-500">
            {formatMsgTime(c.lastMessageAt)}
          </span>
        </div>

        {/* Última Mensagem */}
        <p
          className={cn(
            "mt-0.5 line-clamp-1 text-[11.5px] leading-snug",
            c.isUnread
              ? "font-medium text-ink-secondary dark:text-zinc-200"
              : "text-ink-muted dark:text-zinc-400"
          )}
        >
          {c.lastMessagePreview || "Sem mensagens"}
        </p>

        {/* Metadados / Badges */}
        <div className="mt-1 flex items-center gap-1.5 text-[10px]">
          <span className="truncate text-ink-faint dark:text-zinc-500">
            {c.channel?.name || "WhatsApp"}
          </span>
          <span className="text-ink-faint/50" aria-hidden>·</span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              handoffKind === "ai" && "text-violet-700 dark:text-violet-400",
              handoffKind === "human" && "text-sky-700 dark:text-sky-400",
              handoffKind === "pending" && "text-amber-700 dark:text-amber-400",
              handoffKind === "closed" && "text-ink-faint dark:text-zinc-500"
            )}
          >
            {handoffKind === "ai" && <Bot className="h-2.5 w-2.5" />}
            {handoffKind === "human" && <User className="h-2.5 w-2.5" />}
            {handoffKind === "pending" && <Hourglass className="h-2.5 w-2.5" />}
            {handoffKind === "ai"
              ? "IA"
              : handoffKind === "human"
                ? isMine
                  ? "Você"
                  : (c.assignedTo?.name || "").split(" ")[0] || "Humano"
                : handoffKind === "pending"
                  ? "Aguardando"
                  : "Encerrada"}
          </span>

          {c.contact?.priority && (c.contact.priority === "HIGH" || c.contact.priority === "URGENT") && (
            <span className="rounded bg-rose-500/10 px-1 text-[9px] font-semibold text-rose-700 dark:text-rose-300">
              {leadPriorityLabel[c.contact.priority] || c.contact.priority}
            </span>
          )}

          {c.isFavorite && (
            <Star className="ml-auto h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400" />
          )}
        </div>
      </div>
    </button>
  );
}
