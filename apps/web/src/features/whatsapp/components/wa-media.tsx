"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { getAccessToken } from "@/lib/api";

function resolveMediaHref(url: string) {
  if (url.startsWith("/media/wa/")) return `/nexa-api${url}`;
  return url;
}

export function WaMedia({
  url,
  type,
  caption,
}: {
  url?: string | null;
  type?: string | null;
  caption?: string | null;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    const href = resolveMediaHref(url);
    let revoke: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const token = getAccessToken();
        const res = await fetch(href, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        revoke = URL.createObjectURL(blob);
        setSrc(revoke);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);

  if (!url) return caption ? <p className="whitespace-pre-wrap break-words">{caption}</p> : null;

  const kind = (type || "").toUpperCase();
  if (kind === "IMAGE") {
    return (
      <div className="space-y-1.5">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption || "Imagem"} className="max-h-64 max-w-full rounded-lg" />
        ) : (
          <div className="h-32 w-48 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
        )}
        {caption && !/^\[imagem\]$/i.test(caption) ? (
          <p className="whitespace-pre-wrap break-words">{caption}</p>
        ) : null}
      </div>
    );
  }
  if (kind === "AUDIO") {
    return (
      <div className="space-y-1.5">
        {src ? <audio controls src={src} className="max-w-full" /> : <p>Carregando áudio…</p>}
        {caption && !/^\[áudio\]$/i.test(caption) ? (
          <p className="whitespace-pre-wrap break-words">{caption}</p>
        ) : null}
      </div>
    );
  }
  if (kind === "VIDEO") {
    return (
      <div className="space-y-1.5">
        {src ? <video controls src={src} className="max-h-64 max-w-full rounded-lg" /> : <p>Carregando vídeo…</p>}
        {caption ? <p className="whitespace-pre-wrap break-words">{caption}</p> : null}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <a
        href={src || resolveMediaHref(url)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 underline"
      >
        <FileText className="h-3.5 w-3.5" />
        Documento
      </a>
      {caption ? <p className="whitespace-pre-wrap break-words">{caption}</p> : null}
    </div>
  );
}
