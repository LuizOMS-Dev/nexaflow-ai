"use client";

import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { ConsequenceBanner, DialogFooter, Modal } from "@/components/ui";

export type DeleteTarget =
  | { kind: "single"; id: string; name: string }
  | { kind: "bulk"; count: number };

type Props = {
  target: DeleteTarget | null;
  pending: boolean;
  error: unknown;
  needsForce: boolean;
  onClose: () => void;
  onConfirm: (force: boolean) => void;
};

export function ContactDeleteDialog({
  target,
  pending,
  error,
  needsForce,
  onClose,
  onConfirm,
}: Props) {
  const apiErr = error instanceof ApiError ? error : null;
  const history = needsForce || apiErr?.code === "CONTACT_HAS_HISTORY";
  const count = target?.kind === "bulk" ? target.count : 1;
  const title = history
    ? count > 1
      ? "Excluir contatos com histórico?"
      : "Excluir contato com histórico?"
    : count > 1
      ? `Excluir ${count.toLocaleString("pt-BR")} contatos?`
      : `Excluir ${target?.kind === "single" ? target.name : "contato"}?`;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={title}
      variant="danger"
      icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
      description={
        history
          ? "Há conversas ou oportunidades ligadas. A exclusão apaga esse histórico."
          : undefined
      }
      footer={
        <DialogFooter>
          <button type="button" className="btn-secondary h-9" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-danger h-9"
            disabled={pending}
            onClick={() => onConfirm(history)}
          >
            {pending ? "Excluindo…" : history ? "Excluir mesmo assim" : "Excluir"}
          </button>
        </DialogFooter>
      }
    >
      <ConsequenceBanner tone="danger">
        Excluir apaga conversas e oportunidades. Para só tirar da lista, arquive.
      </ConsequenceBanner>
      {apiErr && apiErr.code !== "CONTACT_HAS_HISTORY" ? (
        <p className="mt-3 text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
          {apiErr.message}
        </p>
      ) : null}
    </Modal>
  );
}
