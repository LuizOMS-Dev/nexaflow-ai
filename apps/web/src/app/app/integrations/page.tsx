"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Trash2,
  Unplug,
  AlertTriangle,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Spinner, useToast } from "@/components/ui";
import { QrDisplay } from "@/components/qr-display";
import { WhatsAppConnectSuccess } from "@/components/whatsapp-connect-success";
import { cn } from "@/lib/utils";
import { TenantSection } from "@/components/tenant/tenant-page";
import { TenantModule } from "@/components/tenant/tenant-module";

type WaChannel = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  config: {
    provider?: string;
    status?: string;
    phone?: string | null;
    qrcode?: string | null;
    lastError?: string | null;
    mode?: string;
  };
};

type StatusResponse = {
  state: string;
  phone?: string | null;
  qrcode?: string | null;
  qrExpiresIn?: number | null;
  provider?: string;
  mode?: string;
  error?: string;
};

/**
 * Estados HUMANOS exibidos ao usuário.
 * Nunca expor Baileys / Evolution / socket / instanceName / provider técnico.
 */
type HumanState =
  | "not_connected"
  | "awaiting_qr"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "session_ended"
  | "error";

const HUMAN_LABEL: Record<HumanState, string> = {
  not_connected: "Não conectado",
  awaiting_qr: "Aguardando QR",
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  disconnected: "Desconectado",
  session_ended: "Sessão encerrada",
  error: "Erro",
};

function resolveHumanState(params: {
  hasChannel: boolean;
  runtimeState?: string | null;
  hasQr?: boolean;
  error?: string | null;
}): HumanState {
  if (!params.hasChannel) return "not_connected";

  const st = (params.runtimeState || "").toLowerCase().trim();
  const err = params.error?.trim();

  if (st === "open") return "connected";
  if (st === "logged_out" || st === "logout") return "session_ended";
  if (st === "reconnecting") return "reconnecting";
  if (st === "error") return "error";
  if (err && st !== "connecting" && st !== "open") return "error";

  if (st === "connecting") {
    return params.hasQr ? "awaiting_qr" : "connecting";
  }

  if (st === "close" || st === "closed" || st === "disconnected") {
    // QR disponível após desconexão → usuário pode escanear de novo
    if (params.hasQr) return "awaiting_qr";
    return "disconnected";
  }

  if (st === "unknown" || !st) {
    if (params.hasQr) return "awaiting_qr";
    if (err) return "error";
    return "connecting";
  }

  if (params.hasQr) return "awaiting_qr";
  return "disconnected";
}

function humanBadgeClass(state: HumanState): string {
  switch (state) {
    case "connected":
      return "badge-success";
    case "awaiting_qr":
    case "connecting":
    case "reconnecting":
      return "badge-brand";
    case "session_ended":
    case "disconnected":
    case "not_connected":
      return "badge-warning";
    case "error":
      return "badge-danger";
    default:
      return "badge-neutral";
  }
}

type Diagnostics = {
  diagnostics?: {
    status?: string;
    health?: string;
    connected?: boolean;
    uptimeSeconds?: number | null;
    lastActivityAt?: string | null;
    reconnectCount24h?: number;
    hasPersistedAuth?: boolean;
    lastError?: string | null;
    queue?: { limits?: { maxPerChannelPerMin?: number } };
  };
};

/** Traduz health técnico para texto humano. */
function healthHuman(raw?: string | null): string {
  if (!raw) return "—";
  const s = raw.toUpperCase();
  if (s.includes("OPER") || s === "OK" || s === "HEALTHY") return "Operando";
  if (s.includes("ATEN") || s.includes("WARN") || s.includes("DEGRAD")) return "Atenção";
  if (s.includes("DOWN") || s.includes("INDISP") || s.includes("ERROR")) return "Indisponível";
  if (s.includes("SEM") || s.includes("EMPTY") || s.includes("UNKNOWN")) return "Sem dados";
  // Evita vazar enums crus se for algo legível
  if (/^[A-Z_]+$/.test(raw) && raw.length > 12) return "—";
  return raw;
}

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, StatusResponse>>({});
  const [qrLoading, setQrLoading] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  /** Animação de sucesso só na transição real → open */
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const [qrExiting, setQrExiting] = useState(false);
  const prevStateRef = useRef<Record<string, string>>({});
  const celebratedRef = useRef<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: () => api<WaChannel[]>("/whatsapp/channels"),
  });

  function syncGlobalAfterConnect() {
    void qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
  }

  function onConnected(channelId: string, phone?: string | null) {
    if (celebratedRef.current.has(channelId)) {
      syncGlobalAfterConnect();
      return;
    }
    celebratedRef.current.add(channelId);
    setQrExiting(true);
    window.setTimeout(() => {
      setQrExiting(false);
      setCelebrateId(channelId);
      syncGlobalAfterConnect();
    }, 280);
    window.setTimeout(() => {
      setCelebrateId((cur) => (cur === channelId ? null : cur));
      toast({
        kind: "success",
        title: "WhatsApp conectado",
        description: phone
          ? `Número ${phone} pronto para atendimento.`
          : "Seu canal está pronto para receber e enviar mensagens.",
        duration: 3500,
      });
    }, 280 + 1200);
  }

  async function refreshStatus(id: string, withSpinner = false) {
    if (withSpinner) setQrLoading(true);
    try {
      const st = await api<StatusResponse>(`/whatsapp/channels/${id}/status`);
      setStatusMap((prev) => {
        const knownBefore = id in prevStateRef.current || Boolean(prev[id]);
        const prevState = prev[id]?.state ?? prevStateRef.current[id];
        if (
          st.state === "open" &&
          knownBefore &&
          prevState &&
          prevState !== "open" &&
          prevState !== "unknown"
        ) {
          queueMicrotask(() => onConnected(id, st.phone));
        }
        prevStateRef.current[id] = st.state;
        if (st.state !== "open") {
          celebratedRef.current.delete(id);
        }
        return { ...prev, [id]: st };
      });
      if (st.state === "open" || st.state === "close" || st.state === "logged_out") {
        void qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      return st;
    } catch {
      return null;
    } finally {
      if (withSpinner) setQrLoading(false);
    }
  }

  useEffect(() => {
    if (!data?.length) return;
    data.forEach((ch) => void refreshStatus(ch.id));
    const t = setInterval(() => {
      data.forEach((ch) => {
        const st = statusMap[ch.id]?.state ?? prevStateRef.current[ch.id];
        if (st !== "open") void refreshStatus(ch.id);
      });
    }, 4_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.map((d) => d.id).join(",")]);

  const connectMutation = useMutation({
    mutationFn: () =>
      api<WaChannel>("/whatsapp/connect", {
        method: "POST",
        json: {
          name: "WhatsApp",
          mode: "platform",
          riskAcknowledged: true,
        },
      }),
    onSuccess: async (ch) => {
      await qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
      await qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedId(ch.id);
      await refreshStatus(ch.id, true);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/whatsapp/channels/${id}/disconnect`, {
        method: "POST",
        json: {},
        timeoutMs: 15000,
      }),
    onSuccess: async (_data, id) => {
      setStatusMap((prev) => ({
        ...prev,
        [id]: { state: "close", phone: null, qrcode: null },
      }));
      await qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
      await qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/whatsapp/channels/${id}/remove`, {
        method: "POST",
        json: {},
        timeoutMs: 15000,
      }),
    onSuccess: async (_data, id) => {
      setSelectedId((cur) => (cur === id ? null : cur));
      setStatusMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
      await qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const selected = data?.find((c) => c.id === selectedId) || data?.[0] || null;
  const selectedStatus = selected ? statusMap[selected.id] : null;
  const runtimeState = selectedStatus?.state || selected?.config.status || "unknown";
  const qrSrc = selectedStatus?.qrcode || selected?.config.qrcode || null;
  const lastError =
    selectedStatus?.error || selected?.config.lastError || null;
  const phone = selectedStatus?.phone || selected?.config.phone || null;

  const human = selected
    ? resolveHumanState({
        hasChannel: true,
        runtimeState,
        hasQr: Boolean(qrSrc),
        error: lastError,
      })
    : "not_connected";

  const hasChannels = !!data?.length;
  const connecting = connectMutation.isPending;
  const busy = disconnectMutation.isPending || deleteMutation.isPending;

  function channelHuman(ch: WaChannel): HumanState {
    const st = statusMap[ch.id]?.state || ch.config.status || "unknown";
    const qr = statusMap[ch.id]?.qrcode || ch.config.qrcode;
    const err = statusMap[ch.id]?.error || ch.config.lastError;
    return resolveHumanState({
      hasChannel: true,
      runtimeState: st,
      hasQr: Boolean(qr),
      error: err,
    });
  }

  /** Ação primária coerente com o estado humano (exceto QR embutido no painel). */
  function primaryAction() {
    if (!selected) return null;

    switch (human) {
      case "connected":
        return null; // status panel is enough; Desconectar is secondary
      case "awaiting_qr":
        return (
          <button
            type="button"
            className="btn-secondary h-9 text-xs"
            onClick={() => void refreshStatus(selected.id, true)}
            disabled={qrLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", qrLoading && "animate-spin")} />
            Atualizar QR
          </button>
        );
      case "connecting":
      case "reconnecting":
        return (
          <button
            type="button"
            className="btn-secondary h-9 text-xs"
            onClick={() => void refreshStatus(selected.id, true)}
            disabled={qrLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", qrLoading && "animate-spin")} />
            Atualizar status
          </button>
        );
      case "disconnected":
      case "session_ended":
      case "error":
        return (
          <button
            type="button"
            className="btn-primary h-9 text-xs"
            onClick={() => {
              // Tenta obter QR / restabelecer via refresh; se falhar, cria nova conexão
              void refreshStatus(selected.id, true).then((st) => {
                if (!st?.qrcode && st?.state !== "open") {
                  connectMutation.mutate();
                }
              });
            }}
            disabled={connecting || qrLoading}
          >
            {connecting || qrLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando…
              </>
            ) : human === "session_ended" ? (
              "Conectar novamente"
            ) : human === "error" ? (
              "Tentar novamente"
            ) : (
              "Reconectar"
            )}
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <TenantModule
      kind="connect"
      title="Canais"
      kicker="Conexão"
      actions={
        hasChannels ? (
          <button
            type="button"
            className="btn-primary h-9"
            onClick={() => connectMutation.mutate()}
            disabled={connecting}
            data-tour="channels-header"
          >
            {connecting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando…
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Adicionar número
              </>
            )}
          </button>
        ) : null
      }
    >
      {(connectMutation.isError || disconnectMutation.isError || deleteMutation.isError) && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
        >
          {(connectMutation.error as Error)?.message ||
            (disconnectMutation.error as Error)?.message ||
            (deleteMutation.error as Error)?.message ||
            "Não foi possível concluir a ação. Tente novamente."}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
          <Spinner />
        </div>
      ) : isError ? (
        <EmptyState
          title="Não foi possível carregar os canais"
          description="Verifique a conexão e tente novamente."
          action={
            <button type="button" className="btn-primary h-9" onClick={() => void refetch()}>
              Tentar de novo
            </button>
          }
        />
      ) : !hasChannels ? (
        <div className="nf-connect-hero">
          <div className="mx-auto max-w-md px-2 py-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <MessageCircle className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700/80 dark:text-emerald-300/80">
              WhatsApp
            </p>
            <h2 className="mt-1.5 font-display text-[1.25rem] font-semibold tracking-tight text-ink dark:text-white">
              Não conectado
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted dark:text-zinc-400">
              Conecte um número para receber e enviar mensagens. Você escaneará um QR Code com o
              celular.
            </p>
            <button
              type="button"
              className="btn-primary mx-auto mt-6"
              onClick={() => connectMutation.mutate()}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparando…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Conectar WhatsApp
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          {/* Channel list */}
          <TenantSection title="Números" flush>
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
              {data!.map((ch) => {
                const h = channelHuman(ch);
                const chPhone = statusMap[ch.id]?.phone || ch.config.phone;
                const isSel = selected?.id === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(ch.id);
                      setDiagOpen(false);
                      setDiag(null);
                    }}
                    aria-current={isSel ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                      "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
                      isSel && "bg-violet-50/80 dark:bg-violet-500/10"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        h === "connected"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-400"
                      )}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink dark:text-gray-100">
                        {chPhone || ch.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-muted">{HUMAN_LABEL[h]}</p>
                    </div>
                    {h === "connected" ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-label="Conectado"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </TenantSection>

          {/* Detail — hero de conexão */}
          <div className="nf-connect-hero">
            {!selected ? (
              <EmptyState title="Selecione um número" compact />
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base font-semibold text-ink dark:text-white">
                        {phone || selected.name}
                      </h2>
                      <span className={cn("text-[11px]", humanBadgeClass(human))}>
                        {HUMAN_LABEL[human]}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      WhatsApp
                      {phone && phone !== selected.name ? ` · ${selected.name}` : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {primaryAction()}
                    {human === "connected" ? (
                      <button
                        type="button"
                        className="btn-secondary h-9 text-xs"
                        onClick={() => disconnectMutation.mutate(selected.id)}
                        disabled={busy}
                      >
                        {disconnectMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unplug className="h-3.5 w-3.5" />
                        )}
                        Desconectar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary h-9 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "Remover esta conexão permanentemente? Você precisará escanear o QR de novo."
                          )
                        ) {
                          deleteMutation.mutate(selected.id);
                        }
                      }}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remover
                    </button>
                  </div>
                </div>

                {/* State body */}
                {celebrateId === selected.id || (qrExiting && human === "connected") ? (
                  celebrateId === selected.id ? (
                    <WhatsAppConnectSuccess active />
                  ) : (
                    <div className="wa-qr-exit">
                      <QrDisplay
                        src={qrSrc}
                        expiresIn={selectedStatus?.qrExpiresIn ?? 45}
                        loading={false}
                        error={null}
                        onRefresh={() => undefined}
                        label="Escaneie com o WhatsApp do celular"
                        hint="WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho"
                        size={260}
                      />
                    </div>
                  )
                ) : human === "connected" ? (
                  <div className="wa-connected-panel rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <p className="font-medium text-emerald-900 dark:text-emerald-100">
                            WhatsApp conectado
                          </p>
                          <p className="mt-0.5 text-sm text-emerald-800/85 dark:text-emerald-100/80">
                            {phone
                              ? `Número ${phone} operacional.`
                              : "Pronto para receber e enviar mensagens."}
                          </p>
                        </div>
                      </div>
                      <span className="badge-success shrink-0">Operando</span>
                    </div>
                  </div>
                ) : human === "session_ended" ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="flex items-start gap-3">
                      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                      <div>
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                          Sessão encerrada no aparelho
                        </p>
                        <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-100/80">
                          O WhatsApp foi desconectado no celular. Conecte novamente escaneando um
                          novo QR Code.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : human === "error" ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 dark:border-red-500/20 dark:bg-red-500/10">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />
                      <div>
                        <p className="font-medium text-red-900 dark:text-red-100">
                          Erro na conexão
                        </p>
                        <p className="mt-1 text-sm text-red-800/80 dark:text-red-100/80">
                          {lastError && !/baileys|evolution|socket|instance|wwebjs/i.test(lastError)
                            ? lastError
                            : "Não foi possível manter a sessão. Tente reconectar. Se o problema continuar, fale com o suporte."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : human === "connecting" || human === "reconnecting" ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-black/[0.06] bg-black/[0.02] px-4 py-10 dark:border-white/[0.07] dark:bg-white/[0.02]">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-600 dark:text-violet-400" />
                    <p className="mt-3 text-[14px] font-medium text-ink dark:text-white">
                      {HUMAN_LABEL[human]}…
                    </p>
                    <p className="mt-1 max-w-xs text-center text-[12.5px] text-ink-muted">
                      {human === "reconnecting"
                        ? "Estamos restabelecendo a sessão. Isso costuma levar poucos segundos."
                        : "Preparando a conexão. Em instantes o QR Code estará disponível."}
                    </p>
                  </div>
                ) : human === "awaiting_qr" || human === "disconnected" ? (
                  <QrDisplay
                    src={qrSrc}
                    expiresIn={selectedStatus?.qrExpiresIn ?? 45}
                    loading={qrLoading || connecting || (!qrSrc && human === "awaiting_qr")}
                    error={
                      lastError && !/baileys|evolution|socket|instance|wwebjs/i.test(lastError)
                        ? lastError
                        : null
                    }
                    onRefresh={() => void refreshStatus(selected.id, true)}
                    label="Escaneie com o WhatsApp do celular"
                    hint="WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho"
                    size={260}
                  />
                ) : null}

                {/* Lightweight human diagnostics — no stack terms */}
                <div className="rounded-xl border border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-medium text-ink-muted">Detalhes da conexão</p>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-violet-600 dark:text-violet-400"
                      onClick={async () => {
                        setDiagOpen((v) => !v);
                        if (!diagOpen) {
                          try {
                            const d = await api<Diagnostics>(
                              `/whatsapp/channels/${selected.id}/diagnostics`
                            );
                            setDiag(d);
                          } catch {
                            setDiag(null);
                          }
                        }
                      }}
                    >
                      {diagOpen ? "Ocultar" : "Ver detalhes"}
                    </button>
                  </div>
                  {diagOpen && (
                    <ul className="mt-2.5 space-y-1.5 text-[12.5px] text-ink-secondary dark:text-gray-300">
                      {diag?.diagnostics ? (
                        <>
                          <li>
                            Saúde:{" "}
                            <strong className="text-ink dark:text-white">
                              {healthHuman(diag.diagnostics.health || diag.diagnostics.status)}
                            </strong>
                          </li>
                          <li>
                            Tempo conectado:{" "}
                            {diag.diagnostics.uptimeSeconds != null
                              ? `${Math.floor(diag.diagnostics.uptimeSeconds / 3600)}h ${Math.floor((diag.diagnostics.uptimeSeconds % 3600) / 60)}m`
                              : "—"}
                          </li>
                          <li>
                            Última atividade:{" "}
                            {diag.diagnostics.lastActivityAt
                              ? new Date(diag.diagnostics.lastActivityAt).toLocaleString("pt-BR")
                              : "—"}
                          </li>
                          <li>
                            Reconexões (24h): {diag.diagnostics.reconnectCount24h ?? 0}
                          </li>
                          <li>
                            Sessão salva:{" "}
                            {diag.diagnostics.hasPersistedAuth ? "sim" : "não"}
                          </li>
                          {diag.diagnostics.lastError &&
                          !/baileys|evolution|socket|instance|wwebjs/i.test(
                            diag.diagnostics.lastError
                          ) ? (
                            <li className="text-amber-700 dark:text-amber-300">
                              Último aviso: {diag.diagnostics.lastError}
                            </li>
                          ) : null}
                        </>
                      ) : (
                        <li className="text-ink-faint">Sem detalhes disponíveis no momento.</li>
                      )}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                    Desconectar encerra a sessão neste aparelho. Remover apaga o canal e exige um
                    novo QR. Logout no celular também exige reconexão.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </TenantModule>
  );
}
