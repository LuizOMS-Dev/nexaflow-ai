"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Plus, Upload, Users } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  commercialStatusLabel,
  leadPriorityLabel,
} from "@/lib/utils";
import { EmptyState, ListSkeleton, Spinner } from "@/components/ui";
import { TenantModule } from "@/components/tenant/tenant-module";
import { useContactList } from "../hooks/use-contact-list";
import { useContactDetail } from "../hooks/use-contact-detail";
import { useContactSelection } from "../hooks/use-contact-selection";
import { useContactMutations } from "../hooks/use-contact-mutations";
import { useContactImport } from "../hooks/use-contact-import";
import {
  bulkFiltersFromState,
  CONTACTS_PAGE_SIZE,
  filtersSignature,
  type BulkAction,
  type BulkPayload,
  type ContactListItem,
} from "../types";
import { ContactsToolbar } from "./contacts-toolbar";
import { ContactsFilters } from "./contacts-filters";
import { ContactsTable } from "./contacts-table";
import { ContactDrawer } from "./contact-drawer";
import { ContactCreateDialog } from "./contact-create-dialog";
import { ContactImportWizard } from "./contact-import-wizard";
import { ContactDeleteDialog, type DeleteTarget } from "./contact-delete-dialog";
import { ContactBulkConfirm, type BulkConfirmState } from "./contact-bulk-confirm";

export function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <ContactsPageInner />
    </Suspense>
  );
}

function ContactsPageInner() {
  const list = useContactList();
  const {
    qInput,
    setQInput,
    filters,
    setFilter,
    setPage,
    setSort,
    filtersOpen,
    setFiltersOpen,
    contactId,
    setContactId,
    list: query,
    memberOptions,
    canRead,
    canCreate,
    canUpdate,
    canDelete,
  } = list;

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageIds = useMemo(() => items.map((i) => i.id), [items]);
  const selection = useContactSelection({
    pageIds,
    total,
    filterKey: filtersSignature(filters),
  });

  const detail = useContactDetail(contactId);
  const imp = useContactImport();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteForce, setDeleteForce] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirmState | null>(null);
  const [pendingSingle, setPendingSingle] = useState<{
    action: "archive" | "restore";
    id: string;
  } | null>(null);
  const muts = useContactMutations({
    onCreated: (id) => {
      setCreateOpen(false);
      setContactId(id);
    },
  });

  const hasSearch = Boolean(filters.q);
  const hasFacet =
    Boolean(filters.status) || Boolean(filters.priority) || Boolean(filters.assignee);

  function shouldConfirmSoft(count: number) {
    return count >= 20 || selection.sel.mode === "allMatching";
  }

  function runBulk(action: BulkAction, payload?: BulkPayload) {
    const target = selection.bulkTarget(bulkFiltersFromState(filters));
    muts.bulkMut.mutate(
      { action, ...target, payload },
      {
        onSuccess: () => {
          selection.clear();
          setBulkConfirm(null);
        },
      }
    );
  }

  function requestBulk(action: BulkAction, payload: BulkPayload | undefined, confirm: BulkConfirmState) {
    if (action === "archive" || action === "restore") {
      setBulkConfirm(confirm);
      return;
    }
    if (shouldConfirmSoft(selection.count)) {
      setBulkConfirm(confirm);
      return;
    }
    runBulk(action, payload);
  }

  function onBulkStatus(status: string) {
    requestBulk(
      "set_status",
      { commercialStatus: status },
      {
        action: "set_status",
        payload: { commercialStatus: status },
        title: `Alterar status de ${selection.count.toLocaleString("pt-BR")} contatos?`,
        description: `Novo status: ${commercialStatusLabel[status] ?? status}.`,
      }
    );
  }

  function onBulkPriority(priority: string) {
    requestBulk(
      "set_priority",
      { priority },
      {
        action: "set_priority",
        payload: { priority },
        title: `Alterar prioridade de ${selection.count.toLocaleString("pt-BR")} contatos?`,
        description: `Nova prioridade: ${leadPriorityLabel[priority] ?? priority}.`,
      }
    );
  }

  function onBulkResponsible(userId: string | null) {
    requestBulk(
      "set_responsible",
      { responsibleUserId: userId },
      {
        action: "set_responsible",
        payload: { responsibleUserId: userId },
        title: `Alterar responsável de ${selection.count.toLocaleString("pt-BR")} contatos?`,
        description: userId
          ? `Novo responsável: ${memberOptions.find((m) => m.value === userId)?.label ?? "membro"}.`
          : "Os contatos ficarão sem responsável.",
      }
    );
  }

  function onArchiveOne(c: ContactListItem) {
    if (!canUpdate) return;
    setBulkConfirm({
      action: "archive",
      title: `Arquivar ${c.name}?`,
      description: "O contato sai da lista ativa. Você pode restaurar depois.",
    });
    setPendingSingle({ action: "archive", id: c.id });
  }

  function onRestoreOne(c: ContactListItem) {
    if (!canUpdate) return;
    setBulkConfirm({
      action: "restore",
      title: `Restaurar ${c.name}?`,
      description: "O contato volta para a lista ativa.",
    });
    setPendingSingle({ action: "restore", id: c.id });
  }

  function confirmBulk() {
    if (pendingSingle) {
      muts.updateMut.mutate(
        {
          id: pendingSingle.id,
          body: { archived: pendingSingle.action === "archive" },
        },
        {
          onSuccess: () => {
            setPendingSingle(null);
            setBulkConfirm(null);
          },
        }
      );
      return;
    }
    if (!bulkConfirm) return;
    runBulk(bulkConfirm.action, bulkConfirm.payload);
  }

  function openDelete(c: ContactListItem) {
    setDeleteForce(false);
    setDeleteTarget({ kind: "single", id: c.id, name: c.name });
  }

  function confirmDelete(force: boolean) {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "single") {
      muts.deleteMut.mutate(
        { id: deleteTarget.id, force },
        {
          onSuccess: () => {
            setDeleteTarget(null);
            setDeleteForce(false);
            if (contactId === deleteTarget.id) setContactId(null);
          },
          onError: (err) => {
            if (err instanceof ApiError && err.code === "CONTACT_HAS_HISTORY") {
              setDeleteForce(true);
            }
          },
        }
      );
      return;
    }
    const target = selection.bulkTarget(bulkFiltersFromState(filters));
    muts.bulkMut.mutate(
      { action: "delete", ...target, payload: { force } },
      {
        onSuccess: () => {
          setDeleteTarget(null);
          setDeleteForce(false);
          selection.clear();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "CONTACT_HAS_HISTORY") {
            setDeleteForce(true);
          }
        },
      }
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      const el = document.querySelector<HTMLInputElement>('input[aria-label="Buscar contatos"]');
      el?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const listError = query.error instanceof ApiError ? query.error : null;
  const showSkeleton = query.isLoading && !query.data;
  const empty = !showSkeleton && !query.isError && items.length === 0 && canRead;

  return (
    <TenantModule
      kind="people"
      kicker="CRM"
      title="Contatos"
      actions={
        canCreate ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary h-9 gap-1.5"
              onClick={() => imp.setOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Importar
            </button>
            <button
              type="button"
              className="btn-primary h-9 gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Novo contato
            </button>
          </div>
        ) : null
      }
    >
      <div className="card overflow-hidden">
        <div className="border-b border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
          <ContactsToolbar
            selectionActive={selection.active}
            selectedCount={selection.count}
            total={total}
            pageSize={CONTACTS_PAGE_SIZE}
            pageAllSelected={selection.pageState === "all"}
            allMatching={selection.sel.mode === "allMatching"}
            canUpdate={canUpdate}
            canDelete={canDelete}
            archived={filters.archived}
            qInput={qInput}
            onQInput={setQInput}
            status={filters.status}
            onStatus={(v) => setFilter("status", v)}
            priority={filters.priority}
            onPriority={(v) => setFilter("priority", v)}
            assignee={filters.assignee}
            onAssignee={(v) => setFilter("assignee", v)}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((v) => !v)}
            members={memberOptions}
            busy={muts.bulkMut.isPending}
            onSelectMatching={selection.selectMatching}
            onClearSelection={selection.clear}
            onBulkStatus={onBulkStatus}
            onBulkPriority={onBulkPriority}
            onBulkResponsible={onBulkResponsible}
            onArchive={() => {
              setPendingSingle(null);
              setBulkConfirm({
                action: "archive",
                title: `Arquivar ${selection.count.toLocaleString("pt-BR")} contatos?`,
                description: "Eles saem da lista ativa. Dá para restaurar depois.",
              });
            }}
            onRestore={() => {
              setPendingSingle(null);
              setBulkConfirm({
                action: "restore",
                title: `Restaurar ${selection.count.toLocaleString("pt-BR")} contatos?`,
                description: "Eles voltam para a lista ativa.",
              });
            }}
            onDelete={() => {
              setDeleteForce(false);
              setDeleteTarget({ kind: "bulk", count: selection.count });
            }}
          />
          {filtersOpen && !selection.active ? (
            <ContactsFilters
              archived={filters.archived}
              onArchived={(v) => setFilter("archived", v)}
              sort={filters.sort}
              order={filters.order}
              onSort={setSort}
            />
          ) : null}
        </div>

        {!canRead ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Sem permissão"
            description="Você não tem acesso para ver os contatos desta empresa."
          />
        ) : listError ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Não foi possível carregar"
            description={listError.message}
            action={
              <button type="button" className="btn-secondary h-9" onClick={() => void query.refetch()}>
                Tentar de novo
              </button>
            }
          />
        ) : showSkeleton ? (
          <ListSkeleton rows={9} />
        ) : empty && hasSearch ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Nada encontrado"
            description={`Nenhum contato corresponde a “${filters.q}”. Ajuste a busca.`}
          />
        ) : empty && hasFacet ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Nenhum contato com esses filtros"
            description="Tente outro status, prioridade ou responsável."
          />
        ) : empty && filters.archived === "1" ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Nenhum arquivado"
            description="Contatos arquivados saem da lista ativa, mas continuam no sistema."
          />
        ) : empty ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Nenhum contato ainda"
            description="Cadastre ou importe para usar o mesmo registro no funil, nas tarefas e no WhatsApp."
            action={
              canCreate ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary h-9"
                    onClick={() => imp.setOpen(true)}
                  >
                    Importar
                  </button>
                  <button
                    type="button"
                    className="btn-primary h-9"
                    onClick={() => setCreateOpen(true)}
                  >
                    Novo contato
                  </button>
                </div>
              ) : null
            }
          />
        ) : (
          <ContactsTable
            items={items}
            total={total}
            page={filters.page}
            limit={CONTACTS_PAGE_SIZE}
            pageState={selection.pageState}
            isSelected={selection.rowSelected}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onToggleRow={selection.toggleRow}
            onTogglePage={selection.toggleHeader}
            onOpen={setContactId}
            onArchive={onArchiveOne}
            onRestore={onRestoreOne}
            onDelete={openDelete}
            onPage={setPage}
          />
        )}
      </div>

      <ContactDrawer
        open={Boolean(contactId)}
        contactId={contactId}
        contact={detail.data}
        loading={detail.isLoading}
        error={detail.error}
        members={memberOptions}
        canUpdate={canUpdate}
        canDelete={canDelete}
        saving={muts.updateMut.isPending}
        onClose={() => setContactId(null)}
        onSave={(id, body) => muts.updateMut.mutateAsync({ id, body })}
        onArchive={(id, archived) =>
          muts.updateMut.mutate({ id, body: { archived } })
        }
        onDelete={(c) => openDelete(c)}
      />

      <ContactCreateDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          muts.createMut.reset();
        }}
        members={memberOptions}
        pending={muts.createMut.isPending}
        error={muts.createMut.error}
        onSubmit={(body) => muts.createMut.mutate(body)}
        onOpenDuplicate={(id) => setContactId(id)}
      />

      <ContactImportWizard imp={imp} />

      <ContactDeleteDialog
        target={deleteTarget}
        pending={muts.deleteMut.isPending || muts.bulkMut.isPending}
        error={muts.deleteMut.error || muts.bulkMut.error}
        needsForce={deleteForce}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteForce(false);
          muts.deleteMut.reset();
          muts.bulkMut.reset();
        }}
        onConfirm={confirmDelete}
      />

      <ContactBulkConfirm
        state={bulkConfirm}
        pending={muts.bulkMut.isPending || muts.updateMut.isPending}
        errorMessage={
          muts.bulkMut.error instanceof ApiError
            ? muts.bulkMut.error.message
            : muts.updateMut.error instanceof ApiError
              ? muts.updateMut.error.message
              : null
        }
        onClose={() => {
          setBulkConfirm(null);
          setPendingSingle(null);
        }}
        onConfirm={confirmBulk}
      />
    </TenantModule>
  );
}
