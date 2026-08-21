"use client";

import React from "react";
import { Star, Bot, User, Hourglass, Camera, Mic, Film, FileText, Paperclip, Sparkles, CheckCircle2 } from "lucide-react";
import { cn, initials, leadPriorityLabel } from "@/lib/utils";
import { getContactDisplayName } from "@/lib/format-contact";

export type InboxConversationItemProps = {
  conversation: any;
  selected: boolean;
  onSelect: () => void;
  userId?: string;
};

/**
 * Formata o preview da mensagem para eliminar completamente placeholders técnicos
 * como [imagem], [áudio], [documento], etc., substituindo por texto e ícones amigáveis.
 */
function formatConversationPreview(rawPreview?: string | null): React.ReactNode {
  if (!rawPreview || !rawPreview.trim()) {
    return <span className="text-ink-faint dark:text-zinc-500 italic">Sem mensagens</span>;
  }

  const trimmed = rawPreview.trim();

  // 1. Áudio / Mensagem de voz
  if (/^([áudio]|[audio]|🎤|áudio|mensagem de voz)/i.test(trimmed)) {
    return (
      <span className="inline-flex items-center gap-1">
        <Mic className="h-3 w-3 shrink-0 text-violet-600 dark:text-violet-400" />
        <span>Mensagem de voz</span>
      </span>
    );
  }

  // 2. Foto / Imagem
  if (/^([imagem]|📷|foto|imagem)/i.test(trimmed)) {
    const caption = trimmed.replace(/^([imagem(?::s*)?]?|📷|foto|imagem)[:s-]*/i, "").trim();
    return (
      <span className="inline-flex items-center gap-1">
        <Camera className="h-3 w-3 shrink-0 text-sky-600 dark:text-sky-400" />
        <span>{caption ? `Foto · ${caption}` : "Foto"}</span>
      </span>
    );
  }

  // 3. Vídeo
  if (/^([vídeo]|[video]|🎥|vídeo|video)/i.test(trimmed)) {
    const caption = trimmed.replace(/^([v[íi]deo(?::s*)?]?|🎥|v[íi]deo)[:s-]*/i, "").trim();
    return (
      <span className="inline-flex items-center gap-1">
        <Film className="h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
        <span>{caption ? `Vídeo · ${caption}` : "Vídeo"}</span>
      </span>
    );
  }

  // 4. Documento
  if (/^([documento]|📄|documento|pdf)/i.test(trimmed)) {
    const docName = trimmed.replace(/^([documento(?::s*)?]?|📄|documento)[:s-]*/i, "").trim();
    return (
      <span className="inline-flex items-center gap-1">
        <FileText className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="truncate">{docName || "Documento"}</span>
      </span>
    );
  }

  // 5. Arquivo
  if (/^([arquivo]|[mídia]|[midia]|📎|arquivo)/i.test(trimmed)) {
    const fileName = trimmed.replace(/^([arquivo(?::s*)?]?|[m[íi]dia(?::s*)?]?|📎|arquivo)[:s-]*/i, "").trim();
    return (
      <span className="inline-flex items-center gap-1">
        <Paperclip className="h-3 w-3 shrink-0 text-zinc-500 dark:text-zinc-400" />
        <span className="truncate">{fileName || "Arquivo"}</span>
      </span>
    );
  }

  // 6. Texto normal
  return <span>{trimmed}</span>;
}

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
      aria-label={`Conversa com ${displayName}`}
      className={cn(
        "group relative flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 border-b border-black/[0.025] dark:border-white/[0.025]",
        selected
          ? "bg-black/[0.03] dark:bg-white/[0.045]"
          : "hover:bg-black/[0.015] dark:hover:bg-white/[0.02]",
        c.isUnread && !selected && "bg-violet-500/[0.02] dark:bg-violet-400/[0.03]"
      )}
    >
      {/* Indicador de Seleção Ativa Sutil (Barra Vertical de 2.5px) */}
      {selected && (
        <span
          className="absolute bottom-1.5 left-0 top-1.5 w-[2.5px] rounded-r-full bg-violet-600 dark:bg-violet-400"
          aria-hidden
        />
      )}

      {/* Avatar do Contato Compacto (32px) */}
      <div className="relative shrink-0 mt-0.5">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-[10.5px] font-semibold transition-colors",
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
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white bg-violet-600 dark:ring-[#0c0e14] dark:bg-violet-400"
            aria-label="Não lida"
          />
        )}
      </div>

      {/* Conteúdo Central */}
      <div className="min-w-0 flex-1">
        {/* Linha 1: Nome do Contato + Horário */}
        <div className="flex items-baseline justify-between gap-1.5">
          <p
            className={cn(
              "truncate text-[12.5px] text-ink dark:text-zinc-100",
              c.isUnread ? "font-semibold" : "font-medium"
            )}
            title={displayName}
          >
            {displayName}
          </p>
          <span className="shrink-0 text-[10.5px] tabular-nums text-ink-muted/70 dark:text-zinc-500 font-normal">
            {formatMsgTime(c.lastMessageAt)}
          </span>
        </div>

        {/* Linha 2: Preview da Última Mensagem */}
        <p
          className={cn(
            "mt-0.5 line-clamp-1 text-[11.5px] leading-snug",
            c.isUnread
              ? "font-medium text-ink-secondary dark:text-zinc-200"
              : "text-ink-muted/90 dark:text-zinc-400"
          )}
        >
          {formatConversationPreview(c.lastMessagePreview)}
        </p>

        {/* Linha 3: Canal, Responsável / Origem e Tags */}
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-muted/75 dark:text-zinc-500">
          <span className="truncate max-w-[90px]">
            {c.channel?.name || "WhatsApp"}
          </span>
          <span className="opacity-40" aria-hidden>·</span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              handoffKind === "ai" && "text-violet-700 dark:text-violet-400",
              handoffKind === "human" && "text-sky-700 dark:text-sky-400",
              handoffKind === "pending" && "text-amber-700 dark:text-amber-400",
              handoffKind === "closed" && "text-ink-muted dark:text-zinc-500"
            )}
          >
            {handoffKind === "ai" && <Bot className="h-2.5 w-2.5 shrink-0" />}
            {handoffKind === "human" && <User className="h-2.5 w-2.5 shrink-0" />}
            {handoffKind === "pending" && <Hourglass className="h-2.5 w-2.5 shrink-0" />}
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
            <span className="ml-1 rounded bg-rose-500/10 px-1 text-[9px] font-semibold text-rose-700 dark:text-rose-300">
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
