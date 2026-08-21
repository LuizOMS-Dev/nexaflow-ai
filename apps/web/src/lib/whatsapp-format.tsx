"use client";

import React from "react";

/**
 * Renderizador de formatação rica do WhatsApp:
 * - *negrito* -> <strong>
 * - _itálico_ -> <em>
 * - ~tachado~ -> <del>
 * - ```código em bloco``` -> <pre><code>
 * - `código inline` -> <code>
 * - links (https://... ou http://...) -> <a target="_blank" rel="noopener noreferrer">
 */
export function renderWhatsAppFormattedContent(rawText: string): React.ReactNode[] {
  if (!rawText) return [];

  // 1. Divide em blocos de código triplo primeiro (```...```)
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderInlineFormatting(rawText.slice(lastIndex, match.index), `txt-${lastIndex}`));
    }
    parts.push(
      <pre
        key={`cb-${match.index}`}
        className="my-1.5 overflow-x-auto rounded-md bg-black/10 p-2 font-mono text-[11.5px] text-ink dark:bg-white/10 dark:text-zinc-200"
      >
        <code>{match[1]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < rawText.length) {
    parts.push(...renderInlineFormatting(rawText.slice(lastIndex), `txt-${lastIndex}`));
  }

  return parts;
}

function renderInlineFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text) return [];

  const tokenRegex = /(https?:\/\/[^\s<]+|`([^`]+)`|\*([^\*\n]+)\*|_([^\_\n]+)_|~([^~\n]+)~)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let count = 0;

  while ((m = tokenRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      nodes.push(text.slice(lastIdx, m.index));
    }

    const fullMatch = m[0];
    const key = `${keyPrefix}-${count++}`;

    if (fullMatch.startsWith("http://") || fullMatch.startsWith("https://")) {
      nodes.push(
        <a
          key={key}
          href={fullMatch}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline decoration-current underline-offset-2 hover:opacity-80 break-all"
        >
          {fullMatch}
        </a>
      );
    } else if (m[2]) {
      // `code`
      nodes.push(
        <code
          key={key}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11.5px] dark:bg-white/10"
        >
          {m[2]}
        </code>
      );
    } else if (m[3]) {
      // *bold*
      nodes.push(
        <strong key={key} className="font-semibold">
          {m[3]}
        </strong>
      );
    } else if (m[4]) {
      // _italic_
      nodes.push(
        <em key={key} className="italic">
          {m[4]}
        </em>
      );
    } else if (m[5]) {
      // ~strikethrough~
      nodes.push(
        <del key={key} className="line-through opacity-85">
          {m[5]}
        </del>
      );
    }

    lastIdx = m.index + fullMatch.length;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

export function WhatsAppFormattedText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const elements = React.useMemo(() => renderWhatsAppFormattedContent(content), [content]);
  return <div className={className || "whitespace-pre-wrap break-words"}>{elements}</div>;
}
