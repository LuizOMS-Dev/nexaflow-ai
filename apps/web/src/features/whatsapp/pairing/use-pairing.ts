"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/store/auth";
import { hasPermission } from "@/lib/permissions";
import {
  channelStatus,
  connectWhatsApp,
  disconnectChannel,
  listWhatsAppChannels,
  logoutChannel,
  reconnectChannel,
  removeChannel,
} from "../api";
import { resolveHumanState, sanitizePublicError } from "../state";
import type { HumanState, StatusResponse, WaChannel } from "../types";

export function usePairing() {
  const qc = useQueryClient();
  const role = useAuth((s) => s.tenant?.role);
  const platformRole = useAuth((s) => s.user?.platformRole);
  const canManage = hasPermission(role, platformRole, "channels.manage");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, StatusResponse>>({});
  const [spin, setSpin] = useState(false);
  const seen = useRef<Record<string, string>>({});

  const list = useQuery({ queryKey: ["whatsapp-channels"], queryFn: listWhatsAppChannels });
  const items = list.data ?? [];
  const current = items.find((c) => c.id === activeId) ?? items[0] ?? null;

  const pull = useCallback(async (id: string, show = false, refreshQr = false) => {
    if (show) setSpin(true);
    try {
      const st = await channelStatus(id, { refreshQr });
      const before = seen.current[id];
      seen.current[id] = st.state;
      setLive((m) => ({ ...m, [id]: st }));
      if (st.state === "open" && before && before !== "open") {
        void qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      return st;
    } catch {
      return null;
    } finally {
      if (show) setSpin(false);
    }
  }, [qc]);

  useEffect(() => {
    if (!items.length) return;
    items.forEach((c) => void pull(c.id));
    const t = window.setInterval(() => {
      items.forEach((c) => {
        if ((live[c.id]?.state ?? seen.current[c.id]) !== "open") void pull(c.id);
      });
    }, 3000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((c) => c.id).join(",")]);

  useEffect(() => {
    function onRt(ev: Event) {
      const id = (ev as CustomEvent<{ channelId?: string }>).detail?.channelId || current?.id;
      if (id) void pull(id);
      void qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    }
    window.addEventListener("nexaflow:whatsapp-status", onRt);
    return () => window.removeEventListener("nexaflow:whatsapp-status", onRt);
  }, [current?.id, pull, qc]);

  const start = useMutation({
    mutationFn: connectWhatsApp,
    onSuccess: async (ch) => {
      setActiveId(ch.id);
      await qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
      await pull(ch.id, true);
    },
  });
  const pause = useMutation({
    mutationFn: disconnectChannel,
    onSuccess: async (_r, id) => {
      setLive((m) => ({ ...m, [id]: { state: "close", qrcode: null, phone: m[id]?.phone } }));
      await qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
  });
  const end = useMutation({
    mutationFn: logoutChannel,
    onSuccess: async (_r, id) => {
      setLive((m) => ({ ...m, [id]: { state: "logged_out", qrcode: null, phone: null } }));
      await qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
  });
  const resume = useMutation({
    mutationFn: reconnectChannel,
    onSuccess: async (st, id) => {
      setLive((m) => ({ ...m, [id]: { state: st.state, qrcode: st.qrcode, phone: st.phone, qrExpiresIn: st.qrExpiresIn } }));
      await pull(id, true);
    },
  });
  const drop = useMutation({
    mutationFn: removeChannel,
    onSuccess: async (_r, id) => {
      setActiveId((cur) => (cur === id ? null : cur));
      setLive((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      await qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
  });

  const st = current ? live[current.id] : null;
  const runtime = st?.state || current?.config.status || "";
  const qr = st?.qrcode || current?.config.qrcode || null;
  const phone = st?.phone || current?.config.phone || null;
  const err = sanitizePublicError(st?.error || current?.config.lastError);
  const remaining = st?.qrExpiresIn ?? null;
  const phase: HumanState = current
    ? resolveHumanState({
        hasChannel: true,
        runtimeState: runtime,
        hasQr: Boolean(qr),
        qrFresh: remaining == null ? Boolean(qr) : remaining > 0,
        error: err,
        busy: start.isPending || resume.isPending,
      })
    : "not_configured";

  useEffect(() => {
    if (!current?.id) return;
    if (remaining !== 0) return;
    if (phase !== "qr_expired" && phase !== "qr_visible") return;
    void pull(current.id, false, true);
  }, [current?.id, remaining, phase, pull]);

  const fail =
    sanitizePublicError(
      (start.error as Error | undefined)?.message ||
        (pause.error as Error | undefined)?.message ||
        (end.error as Error | undefined)?.message ||
        (resume.error as Error | undefined)?.message ||
        (drop.error as Error | undefined)?.message
    ) || null;

  return {
    canManage,
    list,
    items,
    current,
    phase,
    qr,
    phone,
    err,
    fail,
    spin,
    expires: remaining ?? 20,
    setActiveId,
    refresh: (id: string) => pull(id, true, true),
    start: () => start.mutate(),
    pause: (id: string) => pause.mutate(id),
    end: (id: string) => end.mutate(id),
    resume: (id: string) => resume.mutate(id),
    drop: (id: string) => drop.mutate(id),
    starting: start.isPending,
    pausing: pause.isPending,
    ending: end.isPending,
    resuming: resume.isPending,
    dropping: drop.isPending,
    labelOf: (ch: WaChannel) => live[ch.id]?.phone || ch.config.phone || ch.name,
  };
}

export type Pairing = ReturnType<typeof usePairing>;
