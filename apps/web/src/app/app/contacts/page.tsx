"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  commercialStatusLabel,
  formatDate,
  leadPriorityLabel,
} from "@/lib/utils";
import {
  DialogFooter,
  Dropdown,
  DropdownItem,
  EmptyState,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  PageHeader,
  Spinner,
  Tooltip,
  useToast,
} from "@/components/ui";

type ScoreFactor = { factor?: string; delta?: number; label: string };

type Contact = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  commercialStatus?: string;
  priority?: string;
  score: number;
  scoreBreakdown?: ScoreFactor[] | null;
  nextAction?: string | null;
  source?: string | null;
  stage?: string | null;
  lastInteractionAt?: string;
  tags?: Array<{ tag: { id: string; name: string; color: string } }>;
};

type ScoreHistoryItem = {
  id: string;
  previousScore: number;
  newScore: number;
  source: string;
  note?: string | null;
  createdAt: string;
};

type ContactForm = {
  name: string;
  phone: string;
  email: string;
  company: string;
  city: string;
  source: string;
};

const emptyForm = (): ContactForm => ({
  name: "",
  phone: "",
  email: "",
  company: "",
  city: "",
  source: "manual",
});

function isArchived(c: Contact) {
  return (c.stage || "").toLowerCase() === "archived";
}

export default function ContactsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [historyContact, setHistoryContact] = useState<Contact | null>(null);
  const [csv, setCsv] = useState(
    "nome,telefone,email,empresa\nPedro Lima,11999990000,pedro@email.com,Pedro Ltda"
  );
  const [form, setForm] = useState<ContactForm>(emptyForm());
  const [editForm, setEditForm] = useState<ContactForm>(emptyForm());

  const archivedParam = showArchived ? "1" : "0";

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", search, archivedParam],
    queryFn: () =>
      api<{ items: Contact[] }>(
        `/contacts?search=${encodeURIComponent(search)}&archived=${archivedParam}`
      ),
  });

  const historyQuery = useQuery({
    queryKey: ["score-history", historyContact?.id],
    queryFn: () => api<ScoreHistoryItem[]>(`/contacts/${historyContact!.id}/score-history`),
    enabled: Boolean(historyContact?.id),
  });

  const createMutation = useMutation({
    mutationFn: () => api("/contacts", { method: "POST", json: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setOpen(false);
      setForm(emptyForm());
      toast({ kind: "success", title: "Contato criado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível criar", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api(`/contacts/${editContact!.id}`, {
        method: "PATCH",
        json: {
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          company: editForm.company.trim() || null,
          city: editForm.city.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setEditContact(null);
      toast({ kind: "success", title: "Contato atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  const archiveMutation = useMutation({
    mutationFn: (c: Contact) =>
      api(`/contacts/${c.id}`, {
        method: "PATCH",
        json: { archived: !isArchived(c) },
      }),
    onSuccess: (_d, c) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast({
        kind: "success",
        title: isArchived(c) ? "Contato reativado" : "Contato arquivado",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível atualizar", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteContact(null);
      toast({ kind: "success", title: "Contato excluído" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível excluir", description: e.message }),
  });

  const importMutation = useMutation({
    mutationFn: () => {
      const lines = csv.trim().split(/\r?\n/);
      const rows = lines.slice(1).map((line) => {
        const [name, phone, email, company] = line.split(",").map((s) => s.trim());
        return { name, phone, email, company, source: "import" };
      });
      return api("/contacts/import", { method: "POST", json: { contacts: rows } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setImportOpen(false);
      toast({ kind: "success", title: "Importação concluída" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Falha na importação", description: e.message }),
  });

  function openEdit(c: Contact) {
    setEditContact(c);
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      company: c.company || "",
      city: c.city || "",
      source: c.source || "manual",
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  async function onEditSubmit(e: FormEvent) {
    e.preventDefault();
    await updateMutation.mutateAsync();
  }

  return (
    <div>
      <PageHeader
        title="Contatos"
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Importar
            </button>
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo contato
            </button>
          </>
        }
      />

      <div className="card">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#262b36]">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-faint" />
            <input
              className="input h-9 pl-8"
              placeholder="Buscar nome, e-mail ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={
              showArchived
                ? "btn-secondary h-9 px-3 text-[12.5px]"
                : "btn-ghost h-9 px-3 text-[12.5px] text-ink-muted"
            }
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Arquivados" : "Ver arquivados"}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !data?.items?.length ? (
          <div className="p-6">
            <EmptyState
              title={
                search.trim()
                  ? "Nenhum contato encontrado"
                  : showArchived
                    ? "Nenhum contato arquivado"
                    : "Nenhum contato"
              }
              description={
                !search.trim() && !showArchived
                  ? "Use Novo contato no topo para adicionar o primeiro."
                  : search.trim()
                    ? "Tente outro termo de busca."
                    : undefined
              }
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table min-w-[880px]">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Score</th>
                  <th>Próxima ação</th>
                  <th>Última interação</th>
                  <th className="w-12 text-right">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => {
                  const reasons = Array.isArray(c.scoreBreakdown)
                    ? c.scoreBreakdown.map((r) => r.label).join(" · ")
                    : "Sem detalhamento de score";
                  const archived = isArchived(c);
                  return (
                    <tr key={c.id} className={archived ? "opacity-70" : undefined}>
                      <td className="font-medium text-ink dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          {archived ? (
                            <span className="badge-neutral text-[10px]">Arquivado</span>
                          ) : null}
                        </div>
                        {c.company ? (
                          <div className="text-[11px] font-normal text-ink-faint">{c.company}</div>
                        ) : null}
                      </td>
                      <td>{c.phone || "—"}</td>
                      <td>
                        <span className="badge-neutral">
                          {commercialStatusLabel[c.commercialStatus || ""] ||
                            c.commercialStatus ||
                            "Novo"}
                        </span>
                      </td>
                      <td>
                        <span className="badge-brand">
                          {leadPriorityLabel[c.priority || ""] || c.priority || "Normal"}
                        </span>
                      </td>
                      <td>
                        <Tooltip
                          content={`Score ${c.score}/100 — clique para histórico`}
                          subtitle={reasons}
                          side="top"
                          delay={200}
                        >
                          <button
                            type="button"
                            className="font-medium text-brand-600 dark:text-brand-300"
                            onClick={() => setHistoryContact(c)}
                          >
                            {c.score}/100
                          </button>
                        </Tooltip>
                      </td>
                      <td className="max-w-[10rem] truncate text-xs text-ink-muted">
                        {c.nextAction || "—"}
                      </td>
                      <td>{formatDate(c.lastInteractionAt)}</td>
                      <td className="text-right">
                        <Dropdown
                          align="right"
                          trigger={
                            <button
                              type="button"
                              className="btn-ghost h-8 w-8 px-0"
                              aria-label={`Ações de ${c.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          }
                        >
                          <DropdownItem onClick={() => openEdit(c)}>
                            <Pencil className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
                            Editar
                          </DropdownItem>
                          <DropdownItem onClick={() => archiveMutation.mutate(c)}>
                            {archived ? (
                              <>
                                <ArchiveRestore className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
                                Reativar
                              </>
                            ) : (
                              <>
                                <Archive className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
                                Arquivar
                              </>
                            )}
                          </DropdownItem>
                          <DropdownItem danger onClick={() => setDeleteContact(c)}>
                            <Trash2 className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
                            Excluir
                          </DropdownItem>
                        </Dropdown>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Novo contato */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo contato"
        icon={<UserPlus className="h-4 w-4" strokeWidth={1.75} />}
        size="md"
        variant="contextual"
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
              form="nf-new-contact-form"
              className="btn-primary h-9 px-4 sm:min-w-[8.5rem]"
              disabled={createMutation.isPending || !form.name.trim()}
            >
              {createMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-new-contact-form" onSubmit={onCreate} className="space-y-5">
          <ContactFormFields form={form} setForm={setForm} />
          {createMutation.isError && (
            <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
          )}
        </form>
      </Modal>

      {/* Editar contato */}
      <Modal
        open={!!editContact}
        onClose={() => !updateMutation.isPending && setEditContact(null)}
        title="Editar contato"
        description={editContact?.name}
        icon={<Pencil className="h-4 w-4" strokeWidth={1.75} />}
        size="md"
        variant="contextual"
        preventClose={updateMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              onClick={() => setEditContact(null)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-edit-contact-form"
              className="btn-primary h-9 px-4 sm:min-w-[8.5rem]"
              disabled={updateMutation.isPending || !editForm.name.trim()}
            >
              {updateMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-edit-contact-form" onSubmit={onEditSubmit} className="space-y-5">
          <ContactFormFields form={editForm} setForm={setEditForm} />
          {updateMutation.isError && (
            <p className="text-sm text-red-600">{(updateMutation.error as Error).message}</p>
          )}
        </form>
      </Modal>

      {/* Excluir */}
      <Modal
        open={!!deleteContact}
        onClose={() => setDeleteContact(null)}
        title="Excluir contato?"
        description="Esta ação não pode ser desfeita."
        variant="danger"
        tone="danger"
        size="sm"
        preventClose={deleteMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteContact(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger h-9"
              disabled={deleteMutation.isPending}
              onClick={() => deleteContact && deleteMutation.mutate(deleteContact.id)}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </button>
          </DialogFooter>
        }
      >
        {deleteContact ? (
          <p className="text-sm font-medium text-ink dark:text-white">{deleteContact.name}</p>
        ) : null}
      </Modal>

      {/* Importar */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar contatos"
        description="CSV: nome, telefone, email, empresa."
        icon={<Upload className="h-4 w-4" strokeWidth={1.75} />}
        size="lg"
        variant="soft"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              onClick={() => setImportOpen(false)}
              disabled={importMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4 sm:min-w-[8.5rem]"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || !csv.trim()}
            >
              {importMutation.isPending ? "Importando…" : "Importar"}
            </button>
          </DialogFooter>
        }
      >
        <FormSection title="CSV" surface>
          <FormField label="Conteúdo">
            <textarea
              className="input min-h-[200px] font-mono text-xs leading-relaxed"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="nome,telefone,email,empresa"
            />
          </FormField>
        </FormSection>
      </Modal>

      {/* Histórico de score */}
      <Modal
        open={!!historyContact}
        onClose={() => setHistoryContact(null)}
        title={historyContact ? `Score · ${historyContact.name}` : "Histórico de score"}
        size="sm"
        variant="detail"
      >
        {historyQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !historyQuery.data?.length ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Nenhuma mudança de score. Atual: {historyContact?.score ?? 0}/100
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {historyQuery.data.map((h) => (
              <li
                key={h.id}
                className="rounded-lg border border-black/[0.05] px-3 py-2 text-[12px] dark:border-white/[0.07]"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-ink dark:text-white">
                    {h.previousScore} → {h.newScore}
                  </span>
                  <span className="text-ink-faint">{formatDate(h.createdAt)}</span>
                </div>
                {h.note ? <p className="mt-0.5 text-ink-muted">{h.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function ContactFormFields({
  form,
  setForm,
}: {
  form: ContactForm;
  setForm: (f: ContactForm) => void;
}) {
  return (
    <>
      <FormSection title="Identificação" surface>
        <FormField label="Nome" required>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="Ex.: Ana Costa"
          />
        </FormField>
        <FieldGrid>
          <FormField label="Telefone">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </FormField>
          <FormField label="E-mail">
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@empresa.com"
            />
          </FormField>
        </FieldGrid>
      </FormSection>

      <FormSection title="Comercial" surface>
        <FieldGrid>
          <FormField label="Empresa">
            <input
              className="input"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="Ex.: Acme Ltda"
            />
          </FormField>
          <FormField label="Cidade">
            <input
              className="input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </FormField>
        </FieldGrid>
      </FormSection>
    </>
  );
}
