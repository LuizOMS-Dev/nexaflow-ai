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
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, Spinner, useToast } from "@/components/ui";
import { QrDisplay } from "@/components/qr-display";
import { WhatsAppConnectSuccess } from "@/components/whatsapp-connect-success";
import { cn } from "@/lib/utils";

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

const stateLabel: Record<string, string> = {
  open: "Conectado",
  connecting: "QR pendente",
  reconnecting: "Reconectando",
  close: "Desconectado",
  closed: "Desconectado",
  logged_out: "Logout",
  error: "Erro",
  unknown: "Verificando…",
};

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

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: () => api<WaChannel[]>("/whatsapp/channels"),
  });

  function syncGlobalAfterConnect() {
    void qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
  }

  function onConnected(channelId: string, phone?: string | null) {
    // evita replay se já comemorou nesta sessão
    if (celebratedRef.current.has(channelId)) {
      syncGlobalAfterConnect();
      return;
    }
    celebratedRef.current.add(channelId);
    setQrExiting(true);
    // QR fade ~280ms → celebração
    window.setTimeout(() => {
      setQrExiting(false);
      setCelebrateId(channelId);
      syncGlobalAfterConnect();
    }, 280);
    // fim da celebração ~1.2s + toast discreto
    window.setTimeout(() => {
      setCelebrateId((cur) => (cur === channelId ? null : cur));
      toast({
        kind: "success",
        title: "WhatsApp conectado",
        description: phone
          ? `Canal ${phone} operacional.`
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
        // Só celebra transição real (já conhecíamos um estado ≠ open)
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
    // Poll mais frequente enquanto algum canal não está open
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
      api(`/whatsapp/channels/${id}/disconnect`, { method: "POST", json: {}, timeoutMs: 15000 }),
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
      api(`/whatsapp/channels/${id}/remove`, { method: "POST", json: {}, timeoutMs: 15000 }),
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
  const state = selectedStatus?.state || selected?.config.status || "unknown";
  const hasChannels = !!data?.length;
  const connecting = connectMutation.isPending;

  return (
    <div>
      <div data-tour="channels-header">
      <PageHeader
        title="WhatsApp"
        actions={
          hasChannels ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => connectMutation.mutate()}
              disabled={connecting}
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
      />
      </div>

      {(connectMutation.isError || disconnectMutation.isError || deleteMutation.isError) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {(connectMutation.error as Error)?.message ||
            (disconnectMutation.error as Error)?.message ||
            (deleteMutation.error as Error)?.message}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : !hasChannels ? (
        /* Estado vazio: UM único botão de conectar */
        <div className="card mx-auto max-w-md px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
            <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h2 className="text-[15px] font-semibold text-ink dark:text-white">
            WhatsApp desconectado
          </h2>

          <button
            type="button"
            className="btn-primary mx-auto mt-5"
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
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-3 dark:border-[#262b36]">
              <p className="text-sm font-medium text-ink dark:text-white">Números</p>
            </div>
            <div className="divide-y divide-line-soft dark:divide-white/[0.04]">
              {data!.map((ch) => {
                const st = statusMap[ch.id]?.state || ch.config.status || "unknown";
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedId(ch.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/70 dark:hover:bg-white/[0.02]",
                      selected?.id === ch.id && "bg-brand-50 dark:bg-brand-500/10"
                    )}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink dark:text-gray-100">
                        {ch.name}
                      </p>
                      <p className="text-xs text-ink-muted">{stateLabel[st] || st}</p>
                    </div>
                    {st === "open" && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            {!selected ? (
              <EmptyState
                title="Selecione um número"
              />
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-ink dark:text-white">
                      {selected.name}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      {stateLabel[state] || state}
                      {(selectedStatus?.phone || selected.config.phone) &&
                        ` · ${selectedStatus?.phone || selected.config.phone}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary h-8 text-xs"
                      onClick={() => refreshStatus(selected.id, true)}
                      disabled={qrLoading}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", qrLoading && "animate-spin")} />{" "}
                      Atualizar
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-8 text-xs"
                      onClick={() => disconnectMutation.mutate(selected.id)}
                      disabled={disconnectMutation.isPending || deleteMutation.isPending}
                    >
                      {disconnectMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Unplug className="h-3.5 w-3.5" />
                      )}
                      Desconectar
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-8 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                      disabled={disconnectMutation.isPending || deleteMutation.isPending}
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

                {celebrateId === selected.id || (qrExiting && state === "open") ? (
                  celebrateId === selected.id ? (
                    <WhatsAppConnectSuccess active />
                  ) : (
                    <div className="wa-qr-exit">
                      <QrDisplay
                        src={selectedStatus?.qrcode || selected.config.qrcode}
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
                ) : state === "open" ? (
                  <div className="wa-connected-panel rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <p className="font-medium text-emerald-900 dark:text-emerald-100">
                            WhatsApp
                          </p>
                          <p className="mt-0.5 text-sm text-emerald-800/[0.85] dark:text-emerald-100/80">
                            Conectado
                            {(selectedStatus?.phone || selected.config.phone) &&
                              ` · ${selectedStatus?.phone || selected.config.phone}`}
                          </p>
                          <p className="mt-2 text-xs text-emerald-800/70 dark:text-emerald-200/70">
                            Status: <span className="font-medium">Operando</span>
                            <span className="mx-1.5 text-emerald-700/40 dark:text-emerald-300/40">
                              ·
                            </span>
                            Última atividade: agora
                          </p>
                        </div>
                      </div>
                      <span className="badge-success shrink-0">Operando</span>
                    </div>
                  </div>
                ) : state === "logged_out" ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      Sessão encerrada no aparelho
                    </p>
                    <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-100/80">
                      Conecte novamente com um novo QR. Não há loop automático de reconexão.
                    </p>
                    <button
                      type="button"
                      className="btn-primary mt-3 h-8 text-xs"
                      onClick={() => connectMutation.mutate()}
                    >
                      Conectar novamente
                    </button>
                  </div>
                ) : (
                  <QrDisplay
                    src={selectedStatus?.qrcode || selected.config.qrcode}
                    expiresIn={selectedStatus?.qrExpiresIn ?? 45}
                    loading={qrLoading || connecting}
                    error={selectedStatus?.error || selected.config.lastError}
                    onRefresh={() => refreshStatus(selected.id, true)}
                    label="Escaneie com o WhatsApp do celular"
                    hint="WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho"
                    size={260}
                  />
                )}

                <div className="rounded-xl border border-line px-4 py-3 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-ink-muted">Diagnóstico</p>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-brand-600 dark:text-brand-400"
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
                      {diagOpen ? "Ocultar" : "Ver diagnóstico"}
                    </button>
                  </div>
                  {diagOpen && diag?.diagnostics && (
                    <ul className="mt-2 space-y-1 text-[12px] text-ink-secondary dark:text-gray-300">
                      <li>
                        Status:{" "}
                        <strong className="text-ink dark:text-white">
                          {diag.diagnostics.health || diag.diagnostics.status || "—"}
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
                        Credenciais persistidas:{" "}
                        {diag.diagnostics.hasPersistedAuth ? "sim" : "não"}
                      </li>
                      {diag.diagnostics.lastError ? (
                        <li className="text-amber-700 dark:text-amber-300">
                          Último erro: {diag.diagnostics.lastError}
                        </li>
                      ) : null}
                    </ul>
                  )}
                  <p className="mt-2 text-[10px] text-ink-faint">
                    Desconectar encerra o socket. Remover apaga o canal. Logout no celular exige novo
                    QR.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
