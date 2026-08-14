"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Archive, ArchiveRestore, Trash2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  DateInput,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  NumberInput,
  Select,
  SelectAvatar,
  Spinner,
} from "@/components/ui";
import {
  cn,
  commercialStatusLabel,
  formatDate,
  leadPriorityLabel,
} from "@/lib/utils";
import {
  isArchivedStage,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  priorityBadgeClass,
  statusBadgeClass,
  type ContactDetail,
  type ContactWriteInput,
} from "../types";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type MemberOpt = { value: string; label: string; description?: string };

type IdentityForm = {
  name: string;
  phone: string;
  email: string;
  company: string;
  jobTitle: string;
  city: string;
  state: string;
  document: string;
  source: string;
};

type CommercialForm = {
  commercialStatus: string;
  priority: string;
  score: string;
  responsibleUserId: string;
  nextAction: string;
  nextActionDueAt: string;
};

function isoToDateInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function identityFrom(c: ContactDetail): IdentityForm {
  return {
    name: c.name || "",
    phone: c.phone || "",
    email: c.email || "",
    company: c.company || "",
    jobTitle: c.jobTitle || "",
    city: c.city || "",
    state: c.state || "",
    document: c.document || "",
    source: c.source || "",
  };
}

function commercialFrom(c: ContactDetail): CommercialForm {
  return {
    commercialStatus: c.commercialStatus,
    priority: c.priority,
    score: String(c.score ?? 0),
    responsibleUserId: c.responsibleUser?.id || "",
    nextAction: c.nextAction || "",
    nextActionDueAt: isoToDateInput(c.nextActionDueAt),
  };
}

type Props = {
  open: boolean;
  contactId: string | null;
  contact?: ContactDetail;
  loading: boolean;
  error: unknown;
  members: MemberOpt[];
  canUpdate: boolean;
  canDelete: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (id: string, body: ContactWriteInput) => Promise<unknown> | void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (c: ContactDetail) => void;
};

export function ContactDrawer({
  open,
  contactId,
  contact,
  loading,
  error,
  members,
  canUpdate,
  canDelete,
  saving,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const [identity, setIdentity] = useState<IdentityForm | null>(null);
  const [commercial, setCommercial] = useState<CommercialForm | null>(null);
  const [notes, setNotes] = useState("");
  const [fieldError, setFieldError] = useState<{ phone?: string; email?: string; form?: string }>(
    {}
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!contact) return;
    setIdentity(identityFrom(contact));
    setCommercial(commercialFrom(contact));
    setNotes(contact.notes || "");
    setFieldError({});
  }, [contact]);

  const identityDirty = useMemo(() => {
    if (!contact || !identity) return false;
    return JSON.stringify(identity) !== JSON.stringify(identityFrom(contact));
  }, [contact, identity]);

  const commercialDirty = useMemo(() => {
    if (!contact || !commercial) return false;
    return JSON.stringify(commercial) !== JSON.stringify(commercialFrom(contact));
  }, [contact, commercial]);

  const notesDirty = Boolean(contact && notes !== (contact.notes || ""));
  const dirty = identityDirty || commercialDirty || notesDirty;

  function requestClose() {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      panelRef.current?.focus({ preventScroll: true });
    }, 16);

    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const prevOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const list = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getAttribute("aria-hidden") !== "true"
      );
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const prev = prevFocus.current;
      if (prev && document.contains(prev)) prev.focus();
    };
    // dirty is read via requestClose; we rebind when dirty changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  async function saveIdentity() {
    if (!contact || !identity) return;
    setFieldError({});
    try {
      await onSave(contact.id, {
        name: identity.name.trim() || null,
        phone: identity.phone.trim() || null,
        email: identity.email.trim() || null,
        company: identity.company.trim() || null,
        jobTitle: identity.jobTitle.trim() || null,
        city: identity.city.trim() || null,
        state: identity.state.trim() || null,
        document: identity.document.trim() || null,
        source: identity.source.trim() || null,
      });
    } catch (err) {
      applySaveError(err);
    }
  }

  async function saveCommercial() {
    if (!contact || !commercial) return;
    setFieldError({});
    const score = Number(commercial.score);
    try {
      await onSave(contact.id, {
        commercialStatus: commercial.commercialStatus,
        priority: commercial.priority,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
        responsibleUserId: commercial.responsibleUserId || null,
        nextAction: commercial.nextAction.trim() || null,
        nextActionDueAt: dateInputToIso(commercial.nextActionDueAt),
      });
    } catch (err) {
      applySaveError(err);
    }
  }

  async function saveNotes() {
    if (!contact) return;
    setFieldError({});
    try {
      await onSave(contact.id, { notes: notes.trim() || null });
    } catch (err) {
      applySaveError(err);
    }
  }

  function applySaveError(err: unknown) {
    if (!(err instanceof ApiError)) {
      setFieldError({ form: "Não foi possível salvar" });
      return;
    }
    if (err.code === "PHONE_INVALID") setFieldError({ phone: err.message });
    else if (err.code === "EMAIL_INVALID") setFieldError({ email: err.message });
    else if (err.code === "DUPLICATE_PHONE" || err.code === "DUPLICATE_EMAIL") {
      setFieldError({ form: err.message });
    } else setFieldError({ form: err.message });
  }

  if (!open || !mounted || !contactId) return null;

  const archived = contact ? isArchivedStage(contact.stage) : false;
  const apiErr = error instanceof ApiError ? error : null;

  const panel = (
    <div className="fixed inset-0" style={{ zIndex: "var(--z-drawer)" }}>
      <button
        type="button"
        className="absolute inset-0 bg-black/25 md:bg-black/10"
        aria-label="Fechar ficha"
        onClick={requestClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col outline-none",
          "md:w-[28.75rem] md:max-w-[92vw]",
          "border-l border-black/[0.06] bg-[var(--surface-raised)]",
          "shadow-[-16px_0_40px_-20px_rgba(15,23,42,0.28)]",
          "dark:border-white/[0.08] dark:shadow-[-16px_0_48px_-18px_rgba(0,0,0,0.55)]"
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-black/[0.05] px-4 py-3.5 dark:border-white/[0.07]">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
              Contato
            </p>
            <h2
              id={titleId}
              className="truncate font-display text-[1.15rem] font-semibold tracking-tight text-ink dark:text-white"
            >
              {contact?.name || "Carregando…"}
            </h2>
            {contact?.company ? (
              <p className="truncate text-[12.5px] text-ink-muted">{contact.company}</p>
            ) : null}
            {contact ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={statusBadgeClass(contact.commercialStatus)}>
                  {commercialStatusLabel[contact.commercialStatus] ?? contact.commercialStatus}
                </span>
                <span className={priorityBadgeClass(contact.priority)}>
                  {leadPriorityLabel[contact.priority] ?? contact.priority}
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="btn-ghost h-9 w-9 shrink-0 px-0"
            aria-label="Fechar"
            onClick={requestClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {loading && !contact ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : apiErr ? (
            <p className="text-[13px] text-rose-600 dark:text-rose-400">{apiErr.message}</p>
          ) : contact && identity && commercial ? (
            <div className="space-y-5">
              {fieldError.form ? (
                <p className="text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
                  {fieldError.form}
                </p>
              ) : null}

              <FormSection title="Identidade">
                <FormField label="Nome">
                  <input
                    className="input h-9 text-[13px]"
                    value={identity.name}
                    disabled={!canUpdate}
                    onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
                  />
                </FormField>
                <FieldGrid>
                  <FormField label="Telefone" error={fieldError.phone}>
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.phone}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, phone: e.target.value })}
                    />
                  </FormField>
                  <FormField label="E-mail" error={fieldError.email}>
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.email}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, email: e.target.value })}
                    />
                  </FormField>
                </FieldGrid>
                <FieldGrid>
                  <FormField label="Empresa">
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.company}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, company: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Cargo">
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.jobTitle}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, jobTitle: e.target.value })}
                    />
                  </FormField>
                </FieldGrid>
                <FieldGrid>
                  <FormField label="Cidade">
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.city}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, city: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Estado">
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.state}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, state: e.target.value })}
                    />
                  </FormField>
                </FieldGrid>
                <FieldGrid>
                  <FormField label="Documento">
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.document}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, document: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Origem">
                    <input
                      className="input h-9 text-[13px]"
                      value={identity.source}
                      disabled={!canUpdate}
                      onChange={(e) => setIdentity({ ...identity, source: e.target.value })}
                    />
                  </FormField>
                </FieldGrid>
                {canUpdate && identityDirty ? (
                  <ZoneSave pending={saving} onClick={() => void saveIdentity()} />
                ) : null}
              </FormSection>

              <FormSection title="Comercial">
                <FieldGrid>
                  <FormField label="Status">
                    <Select
                      size="sm"
                      value={commercial.commercialStatus}
                      disabled={!canUpdate}
                      onChange={(v) => setCommercial({ ...commercial, commercialStatus: v })}
                      options={LEAD_STATUSES.map((s) => ({
                        value: s,
                        label: commercialStatusLabel[s] ?? s,
                      }))}
                    />
                  </FormField>
                  <FormField label="Prioridade">
                    <Select
                      size="sm"
                      value={commercial.priority}
                      disabled={!canUpdate}
                      onChange={(v) => setCommercial({ ...commercial, priority: v })}
                      options={LEAD_PRIORITIES.map((p) => ({
                        value: p,
                        label: leadPriorityLabel[p] ?? p,
                      }))}
                    />
                  </FormField>
                </FieldGrid>
                <FieldGrid>
                  <FormField label="Score">
                    <NumberInput
                      value={commercial.score}
                      min={0}
                      max={100}
                      disabled={!canUpdate}
                      onChange={(v) => setCommercial({ ...commercial, score: v })}
                    />
                  </FormField>
                  <FormField label="Responsável">
                    <Select
                      size="sm"
                      value={commercial.responsibleUserId}
                      disabled={!canUpdate}
                      onChange={(v) => setCommercial({ ...commercial, responsibleUserId: v })}
                      options={[
                        { value: "", label: "Nenhum" },
                        ...members.map((m) => ({
                          ...m,
                          leading: <SelectAvatar name={m.label} />,
                        })),
                      ]}
                    />
                  </FormField>
                </FieldGrid>
                <FormField label="Próxima ação">
                  <input
                    className="input h-9 text-[13px]"
                    value={commercial.nextAction}
                    disabled={!canUpdate}
                    onChange={(e) =>
                      setCommercial({ ...commercial, nextAction: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Prazo da próxima ação">
                  <DateInput
                    value={commercial.nextActionDueAt}
                    disabled={!canUpdate}
                    onChange={(v) => setCommercial({ ...commercial, nextActionDueAt: v })}
                  />
                </FormField>
                {canUpdate && commercialDirty ? (
                  <ZoneSave pending={saving} onClick={() => void saveCommercial()} />
                ) : null}
              </FormSection>

              <FormSection title="Ligações">
                <LinkGroup
                  empty="Nenhuma conversa recente"
                  items={contact.conversations.slice(0, 3).map((c) => ({
                    href: `/app/inbox?id=${c.id}`,
                    title: c.lastMessagePreview || "Conversa",
                    meta: c.lastMessageAt ? formatDate(c.lastMessageAt) : c.status,
                  }))}
                />
                <LinkGroup
                  empty="Nenhuma oportunidade"
                  items={contact.opportunities.slice(0, 3).map((o) => ({
                    href: "/app/crm",
                    title: o.title,
                    meta: o.status,
                  }))}
                />
                <LinkGroup
                  empty="Nenhuma tarefa"
                  items={contact.tasks.slice(0, 3).map((t) => ({
                    href: "/app/tasks",
                    title: t.title,
                    meta: t.dueAt ? formatDate(t.dueAt) : t.status,
                  }))}
                />
              </FormSection>

              <FormSection title="Histórico de score">
                {contact.scoreHistory.length === 0 ? (
                  <p className="text-[12.5px] text-ink-muted">Sem alterações de score.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {contact.scoreHistory.slice(0, 12).map((h) => (
                      <li
                        key={h.id}
                        className="flex items-baseline justify-between gap-2 text-[12.5px]"
                      >
                        <span className="text-ink-secondary dark:text-gray-300">
                          <span className="tabular-nums">{h.previousScore}</span>
                          {" → "}
                          <span className="tabular-nums font-medium text-ink dark:text-white">
                            {h.newScore}
                          </span>
                          <span className="ml-1.5 text-ink-faint">{h.source}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-faint">
                          {formatDate(h.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </FormSection>

              <FormSection title="Notas">
                <textarea
                  className="input min-h-[120px] text-[13px]"
                  value={notes}
                  disabled={!canUpdate}
                  maxLength={5000}
                  onChange={(e) => setNotes(e.target.value)}
                />
                {canUpdate && notesDirty ? (
                  <ZoneSave pending={saving} onClick={() => void saveNotes()} />
                ) : null}
              </FormSection>
            </div>
          ) : null}
        </div>

        {contact ? (
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-black/[0.05] px-4 py-3 dark:border-white/[0.07]">
            {canUpdate ? (
              <button
                type="button"
                className="btn-secondary h-9 gap-1.5 text-[13px]"
                disabled={saving}
                onClick={() => onArchive(contact.id, !archived)}
              >
                {archived ? (
                  <>
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
                  </>
                ) : (
                  <>
                    <Archive className="h-3.5 w-3.5" /> Arquivar
                  </>
                )}
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="btn-ghost h-9 gap-1.5 text-[13px] text-rose-600 dark:text-rose-400"
                onClick={() => onDelete(contact)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
            ) : null}
          </footer>
        ) : null}
      </aside>

      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Descartar alterações?"
        variant="confirm"
        description="Há mudanças não salvas nesta ficha."
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary h-9"
              onClick={() => setDiscardOpen(false)}
            >
              Continuar editando
            </button>
            <button
              type="button"
              className="btn-primary h-9"
              onClick={() => {
                setDiscardOpen(false);
                onClose();
              }}
            >
              Descartar
            </button>
          </div>
        }
      >
        <p className="text-[13px] text-ink-muted">Essa ação não salva as zonas alteradas.</p>
      </Modal>
    </div>
  );

  return createPortal(panel, document.body);
}

function ZoneSave({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <button type="button" className="btn-primary h-8 px-3 text-[12.5px]" disabled={pending} onClick={onClick}>
        {pending ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

function LinkGroup({
  items,
  empty,
}: {
  items: Array<{ href: string; title: string; meta: string }>;
  empty: string;
}) {
  if (!items.length) {
    return <p className="text-[12.5px] text-ink-muted">{empty}</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={`${it.href}-${it.title}`}>
          <Link
            href={it.href}
            className="flex items-baseline justify-between gap-2 rounded-lg px-1 py-1 text-[12.5px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
          >
            <span className="min-w-0 truncate text-ink dark:text-gray-100">{it.title}</span>
            <span className="shrink-0 text-[11px] text-ink-faint">{it.meta}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}


