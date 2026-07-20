"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatDate } from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  FormField,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { AdminPageHeader } from "../../admin-page-header";

type Item = { category: string; body: string; sortOrder?: number; id?: string };

type Release = {
  id: string;
  version: string;
  title: string;
  summary?: string | null;
  status: string;
  visibility: string;
  publishedAt?: string | null;
  updatedAt: string;
  items: Item[];
  _count?: { seenBy: number };
};

const emptyForm = () => ({
  version: "",
  title: "",
  summary: "",
  visibility: "ALL",
  items: [{ category: "NEW", body: "" }] as Item[],
});

const statusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicada",
  ARCHIVED: "Arquivada",
};

const catLabel: Record<string, string> = {
  NEW: "Novo",
  IMPROVEMENT: "Melhoria",
  FIX: "Correção",
  SECURITY: "Segurança",
};

export default function AdminReleasesPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data, isLoading } = useQuery({
    queryKey: ["admin-changelog"],
    queryFn: () => api<{ items: Release[] }>("/admin/changelog"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const items = data?.items || [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        version: form.version.trim(),
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        visibility: form.visibility as "ALL" | "SUPERADMIN",
        items: form.items
          .filter((i) => i.body.trim())
          .map((i, idx) => ({
            category: i.category as "NEW" | "IMPROVEMENT" | "FIX" | "SECURITY",
            body: i.body.trim(),
            sortOrder: idx,
          })),
      };
      if (editId) {
        return api(`/admin/changelog/${editId}`, { method: "PATCH", json: payload });
      }
      return api("/admin/changelog", { method: "POST", json: payload });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-changelog"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm());
      toast({ kind: "success", title: editId ? "Versão atualizada" : "Versão criada" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => {
      if (action === "delete") {
        return api(`/admin/changelog/${id}`, { method: "DELETE" });
      }
      return api(`/admin/changelog/${id}/${action}`, { method: "POST", json: {} });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-changelog"] });
      toast({ kind: "success", title: "Atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Falha na ação", description: e.message }),
  });

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(r: Release) {
    setEditId(r.id);
    setForm({
      version: r.version,
      title: r.title,
      summary: r.summary || "",
      visibility: r.visibility || "ALL",
      items: r.items.length
        ? r.items.map((i) => ({ category: i.category, body: i.body }))
        : [{ category: "NEW", body: "" }],
    });
    setOpen(true);
  }

  const sorted = useMemo(() => items, [items]);

  if (user?.platformRole !== "SUPERADMIN") return null;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Atualizações e versões"
        description="Gerencie o changelog público da NexaFlow (novidades para os usuários)."
        actions={
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Nova versão
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !sorted.length ? (
        <EmptyState
          title="Nenhuma versão cadastrada"
          description="Crie a primeira release para os usuários verem em Novidades."
          action={
            <button type="button" className="btn-primary" onClick={openCreate}>
              Criar versão
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table min-w-[720px]">
              <thead>
                <tr>
                  <th>Versão</th>
                  <th>Título</th>
                  <th>Status</th>
                  <th>Publicação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">v{r.version}</td>
                    <td>
                      <p className="font-medium text-ink dark:text-white">{r.title}</p>
                      <p className="text-[11.5px] text-ink-faint">
                        {r.items.length} item(ns)
                        {r._count?.seenBy != null ? ` · ${r._count.seenBy} viste(s)` : ""}
                      </p>
                    </td>
                    <td>
                      <span
                        className={cn(
                          r.status === "PUBLISHED"
                            ? "badge-success"
                            : r.status === "ARCHIVED"
                              ? "badge-neutral"
                              : "badge-warning"
                        )}
                      >
                        {statusLabel[r.status] || r.status}
                      </span>
                    </td>
                    <td className="text-ink-muted">
                      {r.publishedAt ? formatDate(r.publishedAt) : "—"}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary h-7 px-2 text-[11.5px]"
                          onClick={() => openEdit(r)}
                        >
                          Editar
                        </button>
                        {r.status !== "PUBLISHED" ? (
                          <button
                            type="button"
                            className="btn-primary h-7 px-2 text-[11.5px]"
                            onClick={() =>
                              actionMutation.mutate({ id: r.id, action: "publish" })
                            }
                          >
                            Publicar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary h-7 px-2 text-[11.5px]"
                            onClick={() =>
                              actionMutation.mutate({ id: r.id, action: "unpublish" })
                            }
                          >
                            Despublicar
                          </button>
                        )}
                        {r.status !== "ARCHIVED" ? (
                          <button
                            type="button"
                            className="btn-secondary h-7 px-2 text-[11.5px]"
                            onClick={() =>
                              actionMutation.mutate({ id: r.id, action: "archive" })
                            }
                          >
                            Arquivar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-secondary h-7 px-2 text-[11.5px]"
                          onClick={() =>
                            actionMutation.mutate({ id: r.id, action: "duplicate" })
                          }
                        >
                          Duplicar
                        </button>
                        {r.status === "DRAFT" ? (
                          <button
                            type="button"
                            className="btn-ghost h-7 px-2 text-[11.5px] text-red-600"
                            onClick={() =>
                              actionMutation.mutate({ id: r.id, action: "delete" })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => !saveMutation.isPending && setOpen(false)}
        title={editId ? "Editar versão" : "Nova versão"}
        size="lg"
        preventClose={saveMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              onClick={() => setOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9"
              disabled={
                saveMutation.isPending || !form.version.trim() || !form.title.trim()
              }
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Versão" required>
              <input
                className="input"
                placeholder="1.8.0"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
              />
            </FormField>
            <FormField label="Visibilidade">
              <Select
                value={form.visibility}
                onChange={(visibility) => setForm({ ...form, visibility })}
                options={[
                  { value: "ALL", label: "Todos os usuários" },
                  { value: "SUPERADMIN", label: "Somente Superadmin" },
                ]}
              />
            </FormField>
          </div>
          <FormField label="Título" required>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Nova experiência com a NIA"
            />
          </FormField>
          <FormField label="Resumo">
            <textarea
              className="input min-h-[72px]"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Resumo curto e seguro para os usuários"
            />
          </FormField>

          <div>
            <p className="label">Itens</p>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-xl border border-line-soft p-2.5 sm:flex-row dark:border-white/[0.06]">
                  <div className="sm:w-40">
                    <Select
                      value={it.category}
                      onChange={(category) => {
                        const next = [...form.items];
                        next[idx] = { ...it, category };
                        setForm({ ...form, items: next });
                      }}
                      options={Object.entries(catLabel).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                      size="sm"
                    />
                  </div>
                  <input
                    className="input flex-1"
                    placeholder="Descrição do item (sem secrets)"
                    value={it.body}
                    onChange={(e) => {
                      const next = [...form.items];
                      next[idx] = { ...it, body: e.target.value };
                      setForm({ ...form, items: next });
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost h-9 w-9 shrink-0 px-0"
                    onClick={() =>
                      setForm({
                        ...form,
                        items: form.items.filter((_, i) => i !== idx),
                      })
                    }
                    disabled={form.items.length <= 1}
                    aria-label="Remover item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary mt-2 h-8 text-[12.5px]"
              onClick={() =>
                setForm({
                  ...form,
                  items: [...form.items, { category: "IMPROVEMENT", body: "" }],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar item
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
