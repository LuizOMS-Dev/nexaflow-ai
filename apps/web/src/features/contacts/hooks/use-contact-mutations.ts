"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui";
import {
  bulkContacts,
  createContact,
  deleteContact,
  updateContact,
} from "../api";
import type { BulkRequest, ContactWriteInput } from "../types";

function invalidateContacts(qc: ReturnType<typeof useQueryClient>, id?: string | null) {
  void qc.invalidateQueries({ queryKey: ["contacts"] });
  if (id) void qc.invalidateQueries({ queryKey: ["contact", id] });
}

export function useContactMutations(opts?: { onCreated?: (id: string) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const createMut = useMutation({
    mutationFn: (body: ContactWriteInput) => createContact(body),
    onSuccess: (row) => {
      invalidateContacts(qc, row.id);
      toast({ kind: "success", title: "Contato criado" });
      opts?.onCreated?.(row.id);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ContactWriteInput }) =>
      updateContact(id, body),
    onSuccess: (_row, vars) => {
      invalidateContacts(qc, vars.id);
    },
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      deleteContact(id, { force }),
    onSuccess: (_res, vars) => {
      qc.removeQueries({ queryKey: ["contact", vars.id] });
      invalidateContacts(qc);
      toast({ kind: "success", title: "Contato excluído" });
    },
  });

  const bulkMut = useMutation({
    mutationFn: (body: BulkRequest) => bulkContacts(body),
    onSuccess: (res) => {
      invalidateContacts(qc);
      toast({
        kind: "success",
        title: `${res.affected.toLocaleString("pt-BR")} contato${
          res.affected === 1 ? "" : "s"
        } atualizado${res.affected === 1 ? "" : "s"}`,
      });
    },
  });

  return { createMut, updateMut, deleteMut, bulkMut };
}
