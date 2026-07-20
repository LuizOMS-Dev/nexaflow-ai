"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
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
  PageHeader,
  Select,
  Spinner,
} from "@/components/ui";

type Campaign = {
  id: string;
  name: string;
  message: string;
  status: string;
  channelType?: string;
  createdAt: string;
};

const statusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  RUNNING: "Em envio",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

const channelLabel: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WEBCHAT: "Web chat",
  EMAIL: "E-mail (futuro)",
  TELEGRAM: "Telegram (futuro)",
  SMS: "SMS",
};

export default function CampaignsPage() {
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/campaigns/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  return (
    <div>
      <PageHeader
        title="Campanhas"
        actions={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova campanha
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <EmptyState
          title="Nenhuma campanha criada"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-secondary dark:bg-white/5">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink dark:text-gray-100">{c.name}</h3>
                    <span className="badge-neutral shrink-0">{statusLabel[c.status] || c.status}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-secondary dark:text-gray-300">
                    {c.message}
                  </p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {channelLabel[c.channelType || ""] || c.channelType || "Canal"}
                    {" · "}
                    {formatDate(c.createdAt)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {c.status === "DRAFT" && (
                      <button
                        type="button"
                        className="btn-secondary h-8 text-xs"
                        onClick={() => statusMutation.mutate({ id: c.id, status: "RUNNING" })}
                      >
                        Iniciar envio
                      </button>
                    )}
                    {c.status === "RUNNING" && (
                      <button
                        type="button"
                        className="btn-secondary h-8 text-xs"
                        onClick={() => statusMutation.mutate({ id: c.id, status: "PAUSED" })}
                      >
                        Pausar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONTEXTUAL — Nova campanha */}
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
          </FormSection>
        </form>
      </Modal>
    </div>
  );
}
