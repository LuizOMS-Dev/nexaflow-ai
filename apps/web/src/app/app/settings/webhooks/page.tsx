"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import {
  DialogFooter,
  Dropdown,
  DropdownItem,
  EmptyState,
  FormField,
  FormSection,
  Modal,
  PageHeader,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";

type WebhookEvent = { type: string; label: string; category: string };

type WebhookRow = {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  events: string[];
  isActive: boolean;
  healthStatus: string;
  failureCount: number;
  lastDeliveryAt?: string | null;
  lastSuccessAt?: string | null;
  createdAt: string;
  secretPreview?: string;
};

type Delivery = {
  id: string;
  event: string;
  status: string;
  statusCode?: number | null;
  success: boolean;
  attempts: number;
  durationMs?: number | null;
  error?: string | null;
  createdAt: string;
};

type IntegrationStatus = {
  webhooks: { enabled: boolean; limit: number; used: number };
  planName?: string | null;
};

export default function WebhooksSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [selected, setSelected] = useState<WebhookRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    url: "",
    description: "",
    events: [] as string[],
  });

  const statusQ = useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => api<IntegrationStatus>("/integrations/status"),
  });

  const eventsQ = useQuery({
    queryKey: ["webhook-events"],
    queryFn: () => api<{ events: WebhookEvent[] }>("/integrations/webhook-events"),
  });

  const listQ = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api<WebhookRow[]>("/webhooks"),
  });

  const deliveriesQ = useQuery({
    queryKey: ["webhook-deliveries", selected?.id],
    queryFn: () => api<Delivery[]>(`/webhooks/${selected!.id}/deliveries`),
    enabled: Boolean(selected?.id),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<{ id: string; secret: string }>("/webhooks", {
        method: "POST",
        json: {
          name: form.name.trim(),
          url: form.url.trim(),
          description: form.description.trim() || undefined,
          events: form.events,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      qc.invalidateQueries({ queryKey: ["integrations-status"] });
      setCreateOpen(false);
      setForm({ name: "", url: "", description: "", events: [] });
      setSecretOnce(res.secret);
      toast({ kind: "success", title: "Webhook criado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível criar", description: e.message }),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string; isActive?: boolean }) =>
      api(`/webhooks/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast({ kind: "success", title: "Webhook atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Erro ao atualizar", description: e.message }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) =>
      api<{ success: boolean; statusCode?: number; error?: string }>(
        `/webhooks/${id}/test`,
        { method: "POST", json: { event: "webhook.test" } }
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["webhook-deliveries"] });
      toast({
        kind: res.success ? "success" : "error",
        title: res.success ? "Teste entregue" : "Teste falhou",
        description: res.success
          ? `HTTP ${res.statusCode ?? 200}`
          : res.error || "Endpoint não respondeu com sucesso",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Falha no teste", description: e.message }),
  });

  const rotateMut = useMutation({
    mutationFn: (id: string) =>
      api<{ secret: string }>(`/webhooks/${id}/rotate-secret`, { method: "POST", json: {} }),
    onSuccess: (res) => {
      setSecretOnce(res.secret);
      toast({ kind: "success", title: "Segredo regenerado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Erro ao regenerar", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setSelected(null);
      toast({ kind: "success", title: "Webhook removido" });
    },
  });

  const events = eventsQ.data?.events || [];
  const byCategory = useMemo(() => {
    const m = new Map<string, WebhookEvent[]>();
    for (const e of events) {
      if (e.type === "webhook.test") continue;
      const list = m.get(e.category) || [];
      list.push(e);
      m.set(e.category, list);
    }
    return m;
  }, [events]);

  const blocked = statusQ.data && statusQ.data.webhooks.limit === 0;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    createMut.mutate();
  }

  function toggleEvent(type: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(type)
        ? f.events.filter((x) => x !== type)
        : [...f.events, type],
    }));
  }

  function healthLabel(w: WebhookRow) {
    if (!w.isActive) return { text: "Pausado", tone: "muted" as const };
    if (w.healthStatus === "failing" || w.failureCount >= 5)
      return { text: "Com falhas", tone: "bad" as const };
    return { text: "Ativo", tone: "ok" as const };
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/app/settings" className="btn-ghost h-8 w-8 px-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader
          title="Webhooks"
          actions={
            !blocked ? (
              <button
                type="button"
                className="btn-primary h-9"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Webhook
              </button>
            ) : null
          }
        />
      </div>



      {blocked ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-5 py-6">
          <p className="text-sm font-semibold text-ink dark:text-white">
            Webhooks não incluídos no seu plano
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Faça upgrade para conectar sistemas externos com eventos da NexaFlow.
          </p>
        </div>
      ) : listQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !listQ.data?.length ? (
        <EmptyState
          icon={<Webhook className="h-5 w-5" strokeWidth={1.5} />}
          title="Nenhum webhook"
          action={
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Adicionar Webhook
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {listQ.data.map((w) => {
            const h = healthLabel(w);
            return (
              <li
                key={w.id}
                className="rounded-2xl border border-line bg-white p-4 dark:border-[#262b36] dark:bg-[#12151c]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSelected(w)}
                  >
                    <p className="text-sm font-semibold text-ink dark:text-white">{w.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-faint">{w.url}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {w.events.length} evento{w.events.length === 1 ? "" : "s"}
                      {w.lastDeliveryAt
                        ? ` · Última entrega ${formatDate(w.lastDeliveryAt)}`
                        : " · Sem entregas ainda"}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        h.tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        h.tone === "bad" && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                        h.tone === "muted" && "bg-black/[0.05] text-ink-muted"
                      )}
                    >
                      {h.text}
                    </span>
                    <Switch
                      size="sm"
                      checked={w.isActive}
                      onChange={(isActive) => patchMut.mutate({ id: w.id, isActive })}
                      aria-label={`Ativar ${w.name}`}
                    />
                    <Dropdown
                      align="right"
                      trigger={
                        <button type="button" className="btn-ghost h-8 w-8 px-0" aria-label="Ações">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      }
                    >
                      <DropdownItem onClick={() => setSelected(w)}>Ver entregas</DropdownItem>
                      <DropdownItem onClick={() => testMut.mutate(w.id)}>
                        Enviar evento de teste
                      </DropdownItem>
                      <DropdownItem
                        onClick={() => {
                          if (confirm("Regenerar o segredo? Integrações antigas param de validar.")) {
                            rotateMut.mutate(w.id);
                          }
                        }}
                      >
                        <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" /> Regenerar segredo
                      </DropdownItem>
                      <DropdownItem
                        danger
                        onClick={() => {
                          if (confirm(`Excluir webhook "${w.name}"?`)) deleteMut.mutate(w.id);
                        }}
                      >
                        <Trash2 className="mr-1.5 inline h-3.5 w-3.5" /> Excluir
                      </DropdownItem>
                    </Dropdown>
                  </div>
                </div>
                {w.healthStatus === "failing" ? (
                  <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">
                    Este Webhook apresenta falhas recorrentes. Teste ou revise a URL.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Secret one-time */}
      <Modal
        open={Boolean(secretOnce)}
        onClose={() => setSecretOnce(null)}
        title="Segredo do Webhook"
        size="md"
        variant="confirm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-primary h-9"
              onClick={() => {
                if (secretOnce) void navigator.clipboard.writeText(secretOnce);
                toast({ kind: "success", title: "Copiado" });
                setSecretOnce(null);
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copiar e fechar
            </button>
          </DialogFooter>
        }
      >
        <p className="text-[13px] text-ink-muted">
          Copie este segredo agora. Ele não será exibido novamente por completo. Use-o para
          validar o header <code className="text-xs">X-NexaFlow-Signature</code>.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface-subtle p-3 text-[12px] dark:border-white/[0.08]">
          {secretOnce}
        </pre>
      </Modal>

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Adicionar Webhook"
        size="lg"
        variant="contextual"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9" onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-webhook-create"
              className="btn-primary h-9"
              disabled={
                createMut.isPending ||
                !form.name.trim() ||
                !form.url.trim() ||
                form.events.length === 0
              }
            >
              {createMut.isPending ? "Criando…" : "Criar Webhook"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-webhook-create" onSubmit={onCreate} className="space-y-4">
          <FormSection title="Endpoint" surface>
            <FormField label="Nome" required>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: CRM externo"
                required
              />
            </FormField>
            <FormField label="URL" required>
              <input
                className="input"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://sistema.com/webhooks/nexaflow"
                required
              />
            </FormField>
            <FormField label="Descrição">
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Opcional"
              />
            </FormField>
          </FormSection>
          <FormSection title="Eventos" surface>
            <div className="max-h-56 space-y-3 overflow-y-auto">
              {Array.from(byCategory.entries()).map(([cat, list]) => (
                <div key={cat}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {cat}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((ev) => {
                      const on = form.events.includes(ev.type);
                      return (
                        <button
                          key={ev.type}
                          type="button"
                          onClick={() => toggleEvent(ev.type)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium",
                            on
                              ? "bg-brand-500/[0.15] text-brand-700 ring-1 ring-brand-500/25 dark:text-brand-200"
                              : "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06]"
                          )}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                          {ev.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </FormSection>
        </form>
      </Modal>

      {/* Deliveries */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? selected.name : "Entregas"}
        description={selected?.url}
        size="lg"
        variant="detail"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9" onClick={() => setSelected(null)}>
              Fechar
            </button>
            {selected ? (
              <button
                type="button"
                className="btn-primary h-9"
                onClick={() => testMut.mutate(selected.id)}
                disabled={testMut.isPending}
              >
                Enviar teste
              </button>
            ) : null}
          </DialogFooter>
        }
      >
        {deliveriesQ.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !deliveriesQ.data?.length ? (
          <p className="text-sm text-ink-muted">Nenhuma entrega ainda.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {deliveriesQ.data.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-line px-3 py-2.5 text-[13px] dark:border-white/[0.08]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink dark:text-white">{d.event}</span>
                  <span
                    className={cn(
                      "text-[11px] font-semibold",
                      d.success ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {d.success ? "Sucesso" : d.status === "retrying" ? "Retentando" : "Falhou"}
                    {d.statusCode != null ? ` · HTTP ${d.statusCode}` : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {formatDate(d.createdAt)} · {d.attempts} tentativa
                  {d.attempts === 1 ? "" : "s"}
                  {d.durationMs != null ? ` · ${d.durationMs} ms` : ""}
                  {d.error ? ` · ${d.error}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
