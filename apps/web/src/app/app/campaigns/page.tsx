"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { TenantModule } from "@/components/tenant/tenant-module";

type CampaignStats = {
  attempted?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  finishedAt?: string;
};

type Campaign = {
  id: string;
  name: string;
  message: string;
  status: string;
  channelType?: string | null;
  segment?: Record<string, unknown> | null;
  scheduledAt?: string | null;
  stats?: CampaignStats | null;
  createdAt: string;
};

const statusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  RUNNING: "Em execução",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "RUNNING":
      return "badge-success";
    case "SCHEDULED":
      return "badge-brand";
    case "PAUSED":
      return "badge-warning";
    case "COMPLETED":
      return "badge-success";
    case "CANCELLED":
      return "badge-neutral";
    case "DRAFT":
    default:
      return "badge-neutral";
  }
}

const channelLabel: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WEBCHAT: "Web chat",
  EMAIL: "E-mail",
  TELEGRAM: "Telegram",
  SMS: "SMS",
};

/** Público-alvo legível a partir do segment (só se houver dados reais). */
function audienceLabel(segment?: Record<string, unknown> | null): string | null {
  if (!segment || typeof segment !== "object") return null;
  const keys = Object.keys(segment);
  if (keys.length === 0) return null;

  if (typeof segment.label === "string" && segment.label.trim()) {
    return segment.label.trim();
  }
  if (typeof segment.name === "string" && segment.name.trim()) {
    return segment.name.trim();
  }
  if (segment.all === true || segment.type === "all") {
    return "Todos os contatos";
  }
  if (typeof segment.tag === "string") return `Tag: ${segment.tag}`;
  if (Array.isArray(segment.tags) && segment.tags.length) {
    return `Tags: ${segment.tags.slice(0, 3).join(", ")}`;
  }
  if (typeof segment.stage === "string") return `Etapa: ${segment.stage}`;
  if (typeof segment.commercialStatus === "string") {
    return `Status: ${segment.commercialStatus}`;
  }
  return "Segmento definido";
}

function progressLabel(stats?: CampaignStats | null): string | null {
  if (!stats) return null;
  const sent = stats.sent ?? 0;
  const failed = stats.failed ?? 0;
  const skipped = stats.skipped ?? 0;
  const attempted = stats.attempted ?? sent + failed + skipped;
  if (attempted <= 0 && sent <= 0 && failed <= 0) return null;
  const parts: string[] = [];
  if (sent > 0) parts.push(`${sent} enviada${sent === 1 ? "" : "s"}`);
  if (failed > 0) parts.push(`${failed} falha${failed === 1 ? "" : "s"}`);
  if (skipped > 0) parts.push(`${skipped} ignorada${skipped === 1 ? "" : "s"}`);
  if (parts.length === 0 && attempted > 0) {
    return `${attempted} tentada${attempted === 1 ? "" : "s"}`;
  }
  return parts.join(" · ") || null;
}

export default function CampaignsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    message: "",
    channelType: "WHATSAPP",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api<Campaign[]>("/campaigns"),
  });

  const createMutation = useMutation({
    mutationFn: () => api("/campaigns", { method: "POST", json: form }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
      setForm({ name: "", message: "", channelType: "WHATSAPP" });
      toast({ kind: "success", title: "Campanha criada" });
    },
    onError: (err) => {
      toast({
        kind: "error",
        title: "Não foi possível criar",
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  /** Inicia envio real (POST /start) — não só PATCH de status. */
  const startMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ result?: CampaignStats }>(`/campaigns/${id}/start`, {
        method: "POST",
        json: {},
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      const r = res?.result;
      const summary = progressLabel(r || null);
      toast({
        kind: "success",
        title: "Envio concluído",
        description: summary || "Campanha processada.",
      });
    },
    onError: (err) => {
      toast({
        kind: "error",
        title: "Não foi possível iniciar",
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/campaigns/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => {
      toast({
        kind: "error",
        title: "Não foi possível atualizar",
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  const items = data || [];
  const busy = startMutation.isPending || statusMutation.isPending;

  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const c of items) {
      by[c.status] = (by[c.status] || 0) + 1;
    }
    return by;
  }, [items]);

  return (
    <TenantModule
      kind="broadcast"
      title="Campanhas"
      kicker="Disparos"
      actions={
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova campanha
        </button>
      }
    >
      {!isLoading && items.length > 0 ? (
        <p className="text-[12.5px] text-ink-faint">
          {items.length} campanha{items.length === 1 ? "" : "s"}
          {counts.RUNNING ? ` · ${counts.RUNNING} em execução` : ""}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !items.length ? (
        <EmptyState
          title="Nenhuma campanha"
          description="Crie a primeira com Nova campanha."
          icon={<Megaphone className="h-4 w-4" strokeWidth={1.75} />}
        />
      ) : (
        <div className="nf-broadcast-list">
          {items.map((c) => {
            const audience = audienceLabel(c.segment);
            const progress = progressLabel(c.stats);
            const dateLabel = c.scheduledAt
              ? `Agendada ${formatDate(c.scheduledAt)}`
              : formatDate(c.createdAt);
            const sent = c.stats?.sent ?? 0;
            const attempted =
              c.stats?.attempted ??
              sent + (c.stats?.failed ?? 0) + (c.stats?.skipped ?? 0);
            const pct =
              attempted > 0 ? Math.min(100, Math.round((sent / attempted) * 100)) : 0;
            return (
              <article
                key={c.id}
                className="nf-broadcast-card"
                data-status={c.status}
              >
                <div className="min-w-0 pl-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[14px] font-semibold tracking-tight text-ink dark:text-white">
                      {c.name}
                    </h2>
                    <span className={statusBadgeClass(c.status)}>
                      {statusLabel[c.status] || c.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                    {c.message}
                  </p>
                  {attempted > 0 ? (
                    <div className="nf-broadcast-progress" aria-hidden>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                  {progress ? (
                    <p className="mt-1 text-[11.5px] tabular-nums text-ink-faint">
                      {progress}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-0.5 pl-1 text-[12.5px] text-ink-muted">
                  <p>
                    {channelLabel[c.channelType || ""] || c.channelType || "Canal"}
                  </p>
                  <p>{audience || "Sem segmento"}</p>
                  <p className="text-ink-faint">{dateLabel}</p>
                </div>
                <div className="pl-1">
                  <CampaignActions
                    campaign={c}
                    busy={busy}
                    onStart={() => startMutation.mutate(c.id)}
                    onPause={() =>
                      statusMutation.mutate({ id: c.id, status: "PAUSED" })
                    }
                    onResume={() =>
                      statusMutation.mutate({ id: c.id, status: "RUNNING" })
                    }
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova campanha"
        size="md"
        variant="contextual"
        initialFocus="panel"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-new-campaign-form"
              className="btn-primary h-9 px-4 sm:min-w-[9rem]"
              disabled={
                createMutation.isPending ||
                !form.name.trim() ||
                !form.message.trim()
              }
            >
              {createMutation.isPending ? "Criando…" : "Criar campanha"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-new-campaign-form" onSubmit={onCreate} className="space-y-4">
          <FormSection title="Campanha" surface>
            <FieldGrid>
              <FormField label="Nome" required>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Ex.: Reengajamento março"
                />
              </FormField>
              <FormField label="Canal">
                <Select
                  value={form.channelType}
                  onChange={(channelType) => setForm({ ...form, channelType })}
                  options={[
                    { value: "WHATSAPP", label: "WhatsApp" },
                    {
                      value: "EMAIL",
                      label: "E-mail (futuro)",
                      description: "Canal ainda não disponível",
                      disabled: true,
                    },
                    {
                      value: "TELEGRAM",
                      label: "Telegram (futuro)",
                      description: "Canal ainda não disponível",
                      disabled: true,
                    },
                  ]}
                  aria-label="Canal"
                />
              </FormField>
            </FieldGrid>
          </FormSection>

          <FormSection title="Mensagem" surface>
            <FormField label="Texto" required>
              <textarea
                className="input min-h-[120px]"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                placeholder="Mensagem da campanha"
              />
            </FormField>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
              O envio usa contatos com telefone e consentimento WhatsApp (quando
              exigido).
            </p>
          </FormSection>
        </form>
      </Modal>
    </TenantModule>
  );
}

function CampaignActions({
  campaign,
  busy,
  onStart,
  onPause,
  onResume,
}: {
  campaign: Campaign;
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const s = campaign.status;
  if (s === "DRAFT" || s === "SCHEDULED") {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn-secondary h-7 px-2.5 text-[11.5px]"
          disabled={busy}
          onClick={onStart}
        >
          Iniciar envio
        </button>
      </div>
    );
  }
  if (s === "RUNNING") {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn-secondary h-7 px-2.5 text-[11.5px]"
          disabled={busy}
          onClick={onPause}
        >
          Pausar
        </button>
      </div>
    );
  }
  if (s === "PAUSED") {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn-secondary h-7 px-2.5 text-[11.5px]"
          disabled={busy}
          onClick={onResume}
        >
          Retomar
        </button>
      </div>
    );
  }
  return <span className="text-[12px] text-ink-faint">—</span>;
}
