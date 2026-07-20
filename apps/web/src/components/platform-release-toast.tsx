"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

/**
 * Toast discreto quando uma release pública é publicada (usuário online).
 * Não bloqueia o trabalho — sem modal.
 */
export function PlatformReleaseToastListener() {
  const { toast } = useToast();
  const router = useRouter();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    function onRelease(ev: Event) {
      const detail = (ev as CustomEvent).detail as {
        entityId?: string;
        title?: string;
        body?: string;
        actionUrl?: string;
        releaseTitle?: string;
        toast?: boolean;
      } | null;
      if (!detail) return;
      const id = detail.entityId || detail.actionUrl || detail.title || "";
      if (id && lastId.current === id) return;
      lastId.current = id || null;

      toast({
        kind: "info",
        title: detail.title || "Tem novidade na NexaFlow",
        description:
          detail.body ||
          detail.releaseTitle ||
          "Uma nova atualização acaba de ser publicada.",
        duration: 6500,
      });

      // Clique no toast não é nativo — o usuário usa o sino ou menu Novidades.
      // Opcional: se actionUrl presente, não navegamos automaticamente.
      void router;
    }

    window.addEventListener("nexaflow:platform-release", onRelease);
    return () => window.removeEventListener("nexaflow:platform-release", onRelease);
  }, [toast, router]);

  return null;
}
