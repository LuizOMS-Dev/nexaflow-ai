"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Modal, useToast } from "@/components/ui";
import { Select } from "@/components/ui-select";

const MEMBER_ROLES = [
  { value: "ADMIN", label: "Administrador" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "AGENT", label: "Atendente" },
  { value: "SALES", label: "Comercial" },
  { value: "READONLY", label: "Somente leitura" },
] as const;

const inputClass =
  "h-9 w-full rounded-lg border border-white/[0.08] bg-[#0c0d12] px-3 text-[13px] text-white placeholder-white/35 focus:border-violet-500/60 focus:outline-none";

export function AddMemberDialog({
  open,
  onClose,
  tenantId,
  tenantName,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("AGENT");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      api(`/admin/tenants/${tenantId}/members`, {
        method: "POST",
        json: { name, email, role },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ kind: "success", title: "Membro adicionado" });
      setName("");
      setEmail("");
      setRole("AGENT");
      setError(null);
      onClose();
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : e.message);
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => !mut.isPending && onClose()}
      title="Adicionar membro"
      description={`Vínculo com ${tenantName}. Se a conta já existir, apenas o acesso à empresa será criado.`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary h-9 px-4 text-[13px]" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="admin-btn-primary h-9 px-4 text-[13px]"
            disabled={mut.isPending || !email.includes("@")}
            onClick={() => {
              setError(null);
              mut.mutate();
            }}
          >
            {mut.isPending ? "Adicionando…" : "Adicionar membro"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-gray-300">Nome</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-gray-300">E-mail</span>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div>
          <span className="mb-1 block text-[12px] font-medium text-gray-300">Papel</span>
          <Select value={role} onChange={setRole} options={[...MEMBER_ROLES]} matchTriggerWidth aria-label="Papel" />
        </div>
        {error ? <p className="text-[12.5px] text-rose-400">{error}</p> : null}
      </div>
    </Modal>
  );
}
