"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  DialogFooter,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  Select,
  SelectAvatar,
} from "@/components/ui";
import { commercialStatusLabel, leadPriorityLabel } from "@/lib/utils";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "../types";

type MemberOpt = { value: string; label: string; description?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  members: MemberOpt[];
  pending: boolean;
  error: unknown;
  onSubmit: (body: {
    name: string | null;
    phone: string | null;
    email: string | null;
    company: string | null;
    commercialStatus: string;
    priority: string;
    responsibleUserId: string | null;
  }) => void;
  onOpenDuplicate: (id: string) => void;
};

const EMPTY = {
  name: "",
  phone: "",
  email: "",
  company: "",
  commercialStatus: "NOVO",
  priority: "NORMAL",
  responsibleUserId: "",
};

export function ContactCreateDialog({
  open,
  onClose,
  members,
  pending,
  error,
  onSubmit,
  onOpenDuplicate,
}: Props) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) setForm(EMPTY);
  }, [open]);

  const apiErr = error instanceof ApiError ? error : null;
  const phoneError = apiErr?.code === "PHONE_INVALID" ? apiErr.message : undefined;
  const emailError = apiErr?.code === "EMAIL_INVALID" ? apiErr.message : undefined;
  const identityError = apiErr?.code === "IDENTITY_REQUIRED" ? apiErr.message : undefined;
  const planError = apiErr?.code === "PLAN_LIMIT_CONTACTS" ? apiErr.message : undefined;
  const duplicate =
    apiErr &&
    (apiErr.code === "DUPLICATE_PHONE" || apiErr.code === "DUPLICATE_EMAIL")
      ? apiErr
      : null;
  const otherError =
    apiErr &&
    !phoneError &&
    !emailError &&
    !identityError &&
    !planError &&
    !duplicate
      ? apiErr.message
      : null;

  function handleClose() {
    setForm(EMPTY);
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: form.name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      commercialStatus: form.commercialStatus,
      priority: form.priority,
      responsibleUserId: form.responsibleUserId || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo contato"
      description="Informe nome ou telefone. O mesmo registro alimenta conversas, funil e tarefas."
      variant="soft"
      size="md"
      footer={
        <DialogFooter>
          <button type="button" className="btn-secondary h-9" onClick={handleClose}>
            Cancelar
          </button>
          <button
            type="submit"
            form="nf-contact-create"
            className="btn-primary h-9"
            disabled={pending}
          >
            {pending ? "Salvando…" : "Criar contato"}
          </button>
        </DialogFooter>
      }
    >
      <form id="nf-contact-create" className="space-y-3" onSubmit={handleSubmit}>
        {planError ? (
          <p className="text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
            {planError}
          </p>
        ) : null}
        {duplicate ? (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[12.5px]"
            role="alert"
          >
            <span>{duplicate.message}</span>
            {duplicate.contactId ? (
              <button
                type="button"
                className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                onClick={() => {
                  onOpenDuplicate(duplicate.contactId!);
                  handleClose();
                }}
              >
                Abrir contato
              </button>
            ) : null}
          </div>
        ) : null}
        {identityError || otherError ? (
          <p className="text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
            {identityError || otherError}
          </p>
        ) : null}

        <FormSection title="Identidade" surface>
          <FormField label="Nome" hint="Obrigatório se não houver telefone">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do contato"
              autoComplete="name"
            />
          </FormField>
          <FormField label="Telefone" error={phoneError} hint="Obrigatório se não houver nome">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Ex.: 11 99999-8888"
              autoComplete="tel"
              inputMode="tel"
            />
          </FormField>
          <FieldGrid>
            <FormField label="E-mail" error={emailError}>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            </FormField>
            <FormField label="Empresa">
              <input
                className="input"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                autoComplete="organization"
              />
            </FormField>
          </FieldGrid>
        </FormSection>

        <FormSection title="Comercial" surface>
          <FieldGrid>
            <FormField label="Status">
              <Select
                value={form.commercialStatus}
                onChange={(v) => setForm({ ...form, commercialStatus: v })}
                options={LEAD_STATUSES.map((s) => ({
                  value: s,
                  label: commercialStatusLabel[s] ?? s,
                }))}
              />
            </FormField>
            <FormField label="Prioridade">
              <Select
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v })}
                options={LEAD_PRIORITIES.map((p) => ({
                  value: p,
                  label: leadPriorityLabel[p] ?? p,
                }))}
              />
            </FormField>
          </FieldGrid>
          <FormField label="Responsável">
            <Select
              value={form.responsibleUserId}
              onChange={(v) => setForm({ ...form, responsibleUserId: v })}
              options={[
                { value: "", label: "Nenhum" },
                ...members.map((m) => ({
                  ...m,
                  leading: <SelectAvatar name={m.label} />,
                })),
              ]}
            />
          </FormField>
        </FormSection>
      </form>
    </Modal>
  );
}
