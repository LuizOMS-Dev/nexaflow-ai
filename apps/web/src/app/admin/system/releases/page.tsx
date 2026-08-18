"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Edit3,
  Eye,
  MoreVertical,
  Package,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatDate } from "@/lib/utils";
import {
  DialogFooter,
  FormField,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import {
  DropdownMenu,
  MenuItem,
  MenuSeparator,
} from "@/components/ui-menu";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminSection,
  AdminSkeleton,
  StatusBadge,
  statusToTone,
} from "@/components/admin";

type Item = {
  id?: string;
  category: "NEW" | "IMPROVEMENT" | "FIX" | "SECURITY" | string;
  body: string;
  sortOrder?: number;
};

type Release = {
  id: string;
  version: string;
  title: string;
  summary?: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  visibility: "ALL" | "SUPERADMIN" | string;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items: Item[];
  _count?: { seenBy: number };
};

const emptyForm = () => ({
  version: "",
  title: "",
  summary: "",
  visibility: "ALL" as "ALL" | "SUPERADMIN",
  items: [{ category: "NEW", body: "" }] as Item[],
});

const statusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicada",
  ARCHIVED: "Arquivada",
};

const categoryMeta: Record<
  string,
  { label: string; tone: "brand" | "neutral" | "success" | "warning"; icon: typeof Sparkles }
> = {
  NEW: { label: "Novo", tone: "brand", icon: Sparkles },
  IMPROVEMENT: { label: "Melhoria", tone: "neutral", icon: Wrench },
  FIX: { label: "Correção", tone: "success", icon: Wrench },
  SECURITY: { label: "Segurança", tone: "warning", icon: Shield },
};

function isSemVer(v: string) {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(v.trim());
}

export default function AdminReleasesPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [initialForm, setInitialForm] = useState(emptyForm());
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Release | null>(null);
  const [viewTarget, setViewTarget] = useState<Release | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-changelog"],
    queryFn: () => api<{ items: Release[] }>("/admin/changelog"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const items = data?.items || [];

  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const v = form.version.trim();
      if (!isSemVer(v)) {
        throw new Error("Informe uma versão válida no formato SemVer (ex: 1.8.0).");
      }
      const title = form.title.trim();
      if (!title) {
        throw new Error("O título da versão é obrigatório.");
      }
      const validItems = form.items
        .filter((i) => i.body.trim().length > 0)
        .map((i, idx) => ({
          category: i.category,
          body: i.body.trim(),
          sortOrder: idx,
        }));
      if (!validItems.length) {
        throw new Error("A versão precisa conter pelo menos um item no changelog.");
      }

      const payload = {
        version: v,
        title,
        summary: form.summary.trim() || null,
        visibility: form.visibility,
        items: validItems,
      };

      if (editId) {
        return api(`/admin/changelog/${editId}`, { method: "PATCH", json: payload });
      }
      return api("/admin/changelog", { method: "POST", json: payload });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-changelog"] });
      void qc.invalidateQueries({ queryKey: ["changelog"] });
      setModalOpen(false);
      setEditId(null);
      setForm(emptyForm());
      setInitialForm(emptyForm());
      toast({
        kind: "success",
        title: editId ? "Versão atualizada com sucesso" : "Nova versão cadastrada com sucesso",
      });
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Não foi possível salvar a versão", description: e.message });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, payload }: { id: string; action: string; payload?: any }) => {
      if (action === "delete") {
        return api(`/admin/changelog/${id}`, { method: "DELETE" });
      }
      return api(`/admin/changelog/${id}/${action}`, { method: "POST", json: payload || {} });
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin-changelog"] });
      void qc.invalidateQueries({ queryKey: ["changelog"] });
      if (vars.action === "delete") {
        setDeleteTarget(null);
        toast({ kind: "success", title: "Versão excluída com sucesso" });
      } else if (vars.action === "publish") {
        toast({ kind: "success", title: "Versão publicada em Novidades" });
      } else if (vars.action === "unpublish") {
        toast({ kind: "success", title: "Versão revertida para rascunho" });
      } else if (vars.action === "archive") {
        toast({ kind: "success", title: "Versão arquivada" });
      } else if (vars.action === "duplicate") {
        toast({ kind: "success", title: "Versão duplicada com sucesso" });
      }
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Operação não concluída", description: e.message });
    },
  });

  function openCreate() {
    const initial = emptyForm();
    setEditId(null);
    setForm(initial);
    setInitialForm(initial);
    setModalOpen(true);
  }

  function openEdit(r: Release) {
    const populated = {
      version: r.version,
      title: r.title,
      summary: r.summary || "",
      visibility: (r.visibility as "ALL" | "SUPERADMIN") || "ALL",
      items: r.items.length
        ? r.items.map((i) => ({ category: i.category, body: i.body }))
        : [{ category: "NEW", body: "" }],
    };
    setEditId(r.id);
    setForm(populated);
    setInitialForm(populated);
    setModalOpen(true);
  }

  function openDuplicate(r: Release) {
    const duplicated = {
      version: "",
      title: `${r.title} (cópia)`,
      summary: r.summary || "",
      visibility: (r.visibility as "ALL" | "SUPERADMIN") || "ALL",
      items: r.items.length
        ? r.items.map((i) => ({ category: i.category, body: i.body }))
        : [{ category: "NEW", body: "" }],
    };
    setEditId(null);
    setForm(duplicated);
    setInitialForm(duplicated);
    setModalOpen(true);
  }

  function handleRequestClose() {
    if (saveMutation.isPending) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
    } else {
      setModalOpen(false);
    }
  }

  const sorted = useMemo(() => items, [items]);
  const publishedCount = sorted.filter((r) => r.status === "PUBLISHED").length;
  const draftCount = sorted.filter((r) => r.status === "DRAFT").length;
  const archivedCount = sorted.filter((r) => r.status === "ARCHIVED").length;

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando versões">
        <div className="space-y-2">
          <AdminSkeleton className="h-8 w-56" />
          <AdminSkeleton className="h-3 w-80" />
        </div>
        <AdminSkeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <AdminErrorState
        title="Não foi possível carregar as versões"
        description="Ocorreu um erro ao conectar com o serviço de changelog."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Atualizações e versões"
        description="Changelog exibido em Novidades."
        badge={
          sorted.length
            ? {
                label: `${publishedCount} publicada${publishedCount === 1 ? "" : "s"}${
                  draftCount > 0 ? ` · ${draftCount} rascunho${draftCount === 1 ? "" : "s"}` : ""
                }${archivedCount > 0 ? ` · ${archivedCount} arquivada${archivedCount === 1 ? "" : "s"}` : ""}`,
                tone: draftCount > 0 ? "info" : "success",
              }
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="admin-btn-secondary h-9 px-3 text-[13px]"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              {isFetching ? "Atualizando…" : "Atualizar"}
            </button>
            {sorted.length > 0 ? (
              <button
                type="button"
                className="admin-btn-primary h-9 px-3.5 text-[13px]"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" /> Nova versão
              </button>
            ) : null}
          </div>
        }
      />

      {!sorted.length ? (
        <AdminSection>
          <AdminEmptyState
            compact
            icon={<Package className="h-5 w-5" strokeWidth={1.5} />}
            title="Nenhuma versão cadastrada"
            description="Publique a primeira atualização para começar o histórico de versões do NexaFlow."
            action={
              <button
                type="button"
                className="admin-btn-primary mt-3 h-8 text-[12.5px]"
                onClick={openCreate}
              >
                <Plus className="h-3.5 w-3.5" /> Criar primeira versão
              </button>
            }
          />
        </AdminSection>
      ) : (
        <AdminSection title="Histórico de versões" flush>
          <div className="admin-table-wrap overflow-x-auto">
            <table className="admin-table w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.01]">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    Versão
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    Título & Resumo
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    Visibilidade
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    Publicação
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const catCounts = r.items.reduce<Record<string, number>>((acc, it) => {
                    const cat = String(it.category || "").toUpperCase();
                    acc[cat] = (acc[cat] || 0) + 1;
                    return acc;
                  }, {});

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3.5 align-top">
                        <span className="font-semibold tabular-nums text-white">
                          v{r.version}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-white/95">{r.title}</p>
                        {r.summary ? (
                          <p className="mt-0.5 max-w-md line-clamp-1 text-[12px] text-gray-400">
                            {r.summary}
                          </p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11.5px] text-gray-500">
                            {r.items.length} {r.items.length === 1 ? "item" : "itens"}
                          </span>
                          {Object.entries(catCounts).map(([cat, count]) => {
                            const meta = categoryMeta[cat] || {
                              label: cat,
                              tone: "neutral",
                            };
                            return (
                              <span
                                key={cat}
                                className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-gray-300"
                              >
                                {meta.label} ({count})
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <StatusBadge tone={statusToTone(r.status)} dot>
                          {statusLabel[r.status] || r.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        {r.visibility === "SUPERADMIN" ? (
                          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20">
                            Somente Superadmin
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-white/[0.05] px-2 py-0.5 text-[11.5px] font-medium text-gray-300 ring-1 ring-inset ring-white/[0.08]">
                            Todos os usuários
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top tabular-nums text-gray-400">
                        {r.publishedAt ? formatDate(r.publishedAt) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="admin-btn-ghost h-8 px-2.5 text-[12px]"
                            onClick={() => openEdit(r)}
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Editar
                          </button>

                          <DropdownMenu
                            trigger={
                              <button
                                type="button"
                                className="admin-btn-ghost h-8 w-8 px-0"
                                aria-label="Mais opções"
                              >
                                <MoreVertical className="h-4 w-4 text-gray-400" />
                              </button>
                            }
                            align="right"
                          >
                            <MenuItem onClick={() => setViewTarget(r)}>
                              <Eye className="h-4 w-4" /> Visualizar detalhes
                            </MenuItem>
                            <MenuItem onClick={() => openDuplicate(r)}>
                              <Copy className="h-4 w-4" /> Duplicar versão
                            </MenuItem>
                            <MenuSeparator />
                            {r.status !== "PUBLISHED" ? (
                              <MenuItem
                                onClick={() =>
                                  actionMutation.mutate({ id: r.id, action: "publish" })
                                }
                              >
                                <Sparkles className="h-4 w-4 text-brand-400" /> Publicar em Novidades
                              </MenuItem>
                            ) : (
                              <MenuItem
                                onClick={() =>
                                  actionMutation.mutate({ id: r.id, action: "unpublish" })
                                }
                              >
                                Reverter para rascunho
                              </MenuItem>
                            )}
                            {r.status !== "ARCHIVED" ? (
                              <MenuItem
                                onClick={() =>
                                  actionMutation.mutate({ id: r.id, action: "archive" })
                                }
                              >
                                Arquivar versão
                              </MenuItem>
                            ) : null}
                            {r.status !== "PUBLISHED" ? (
                              <>
                                <MenuSeparator />
                                <MenuItem
                                  danger
                                  onClick={() => setDeleteTarget(r)}
                                >
                                  <Trash2 className="h-4 w-4" /> Excluir versão
                                </MenuItem>
                              </>
                            ) : null}
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminSection>
      )}

      {/* Modal Unificado de Criação / Edição / Duplicação */}
      <Modal
        open={modalOpen}
        onClose={handleRequestClose}
        title={editId ? "Editar versão" : "Nova versão"}
        description="Registre os itens da atualização para disponibilizar no changelog de Novidades."
        size="lg"
        preventClose={saveMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4 text-[13px]"
              onClick={handleRequestClose}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 px-4 text-[13px]"
              disabled={
                saveMutation.isPending ||
                !form.version.trim() ||
                !form.title.trim() ||
                !form.items.some((i) => i.body.trim().length > 0)
              }
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending
                ? "Salvando…"
                : editId
                ? "Salvar alterações"
                : "Criar versão"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <FormField
              label="Versão"
              required
              hint={
                form.version && !isSemVer(form.version)
                  ? "Formato esperado: 1.8.0"
                  : undefined
              }
            >
              <input
                className={cn(
                  "input",
                  form.version && !isSemVer(form.version) && "border-amber-500/50"
                )}
                placeholder="1.8.0"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                autoFocus={!editId}
              />
            </FormField>

            <FormField label="Visibilidade" required>
              <Select
                value={form.visibility}
                onChange={(val) =>
                  setForm({ ...form, visibility: val as "ALL" | "SUPERADMIN" })
                }
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
              placeholder="Ex: Nova experiência com a NIA e automações"
            />
          </FormField>

          <FormField label="Resumo" hint="Breve contextualização exibida no topo da atualização.">
            <textarea
              className="input min-h-[72px]"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Resumo em linguagem amigável para os clientes"
            />
          </FormField>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink dark:text-white">
                Itens da atualização <span className="text-rose-400">*</span>
              </p>
              <span className="text-[11.5px] text-gray-500">
                Pelo menos 1 item obrigatório
              </span>
            </div>

            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface-base/50 p-2.5 sm:flex-row sm:items-center dark:border-white/[0.06] dark:bg-white/[0.01]"
                >
                  <div className="sm:w-44">
                    <Select
                      value={it.category}
                      onChange={(category) => {
                        const next = [...form.items];
                        next[idx] = { ...it, category };
                        setForm({ ...form, items: next });
                      }}
                      options={[
                        { value: "NEW", label: "Novo" },
                        { value: "IMPROVEMENT", label: "Melhoria" },
                        { value: "FIX", label: "Correção" },
                        { value: "SECURITY", label: "Segurança" },
                      ]}
                      size="sm"
                    />
                  </div>

                  <input
                    className="input flex-1"
                    placeholder="Descrição do item"
                    value={it.body}
                    onChange={(e) => {
                      const next = [...form.items];
                      next[idx] = { ...it, body: e.target.value };
                      setForm({ ...form, items: next });
                    }}
                  />

                  <button
                    type="button"
                    className="admin-btn-ghost h-9 w-9 shrink-0 px-0 text-gray-400 hover:text-rose-400"
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
              className="admin-btn-secondary mt-2 h-8 text-[12.5px]"
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

      {/* Modal de Confirmação de Descarte (Dirty State) */}
      <Modal
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title="Descartar alterações?"
        description="Você possui alterações não salvas no formulário de versão. Tem certeza de que deseja sair sem salvar?"
        variant="confirm"
        tone="warning"
        icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4 text-[13px]"
              onClick={() => setDiscardConfirmOpen(false)}
            >
              Continuar editando
            </button>
            <button
              type="button"
              className="admin-btn-danger h-9 px-4 text-[13px]"
              onClick={() => {
                setDiscardConfirmOpen(false);
                setModalOpen(false);
              }}
            >
              Descartar
            </button>
          </DialogFooter>
        }
      >
        <p className="text-[13px] text-gray-400">
          Todas as alterações feitas nesta sessão serão perdidas.
        </p>
      </Modal>

      {/* Modal de Confirmação de Exclusão */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !actionMutation.isPending && setDeleteTarget(null)}
        title={`Excluir versão ${deleteTarget?.version}?`}
        description="Esta versão será removida do changelog e deixará de aparecer em Novidades."
        variant="danger"
        tone="danger"
        preventClose={actionMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4 text-[13px]"
              onClick={() => setDeleteTarget(null)}
              disabled={actionMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-danger h-9 px-4 text-[13px]"
              disabled={actionMutation.isPending}
              onClick={() =>
                deleteTarget &&
                actionMutation.mutate({ id: deleteTarget.id, action: "delete" })
              }
            >
              {actionMutation.isPending ? "Excluindo…" : "Excluir versão"}
            </button>
          </DialogFooter>
        }
      >
        <p className="text-[13px] text-gray-400">
          A ação de exclusão não pode ser desfeita.
        </p>
      </Modal>

      {/* Modal de Visualização Rápida de Detalhes */}
      <Modal
        open={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        title={`Versão ${viewTarget?.version} — ${viewTarget?.title}`}
        description={viewTarget?.summary || "Sem resumo informado."}
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-4 text-[13px]"
              onClick={() => setViewTarget(null)}
            >
              Fechar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 px-4 text-[13px]"
              onClick={() => {
                const target = viewTarget;
                setViewTarget(null);
                if (target) openEdit(target);
              }}
            >
              <Edit3 className="h-3.5 w-3.5" /> Editar versão
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-[12px]">
            <StatusBadge tone={statusToTone(viewTarget?.status || "")} dot>
              {statusLabel[viewTarget?.status || ""] || viewTarget?.status}
            </StatusBadge>
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-gray-300">
              {viewTarget?.visibility === "SUPERADMIN"
                ? "Somente Superadmin"
                : "Todos os usuários"}
            </span>
            {viewTarget?.publishedAt ? (
              <span className="text-gray-400">
                Publicado em: {formatDate(viewTarget.publishedAt)}
              </span>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-white/[0.06] pt-3">
            <p className="text-[12.5px] font-semibold text-gray-300">Itens incluídos:</p>
            <ul className="space-y-1.5 pl-1">
              {viewTarget?.items.map((it, idx) => {
                const meta = categoryMeta[String(it.category || "").toUpperCase()] || {
                  label: it.category,
                };
                return (
                  <li key={idx} className="text-[13px] text-gray-300">
                    <span className="font-medium text-white/80">[{meta.label}]</span>{" "}
                    {it.body}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  );
}
