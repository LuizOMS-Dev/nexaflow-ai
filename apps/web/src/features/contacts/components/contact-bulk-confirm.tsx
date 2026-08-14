"use client";

import { DialogFooter, Modal } from "@/components/ui";
import type { BulkAction, BulkPayload } from "../types";

export type BulkConfirmState = {
  action: BulkAction;
  payload?: BulkPayload;
  title: string;
  description: string;
};

type Props = {
  state: BulkConfirmState | null;
  pending: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ContactBulkConfirm({
  state,
  pending,
  errorMessage,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={state?.title ?? ""}
      description={state?.description}
      variant="confirm"
      footer={
        <DialogFooter>
          <button type="button" className="btn-secondary h-9" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary h-9"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Aplicando…" : "Confirmar"}
          </button>
        </DialogFooter>
      }
    >
      {errorMessage ? (
        <p className="text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
          {errorMessage}
        </p>
      ) : (
        <p className="text-[13px] text-ink-muted">
          A alteração vale para a seleção atual, incluindo exclusões se você
          desmarcou alguém depois de selecionar todos os resultados.
        </p>
      )}
    </Modal>
  );
}
