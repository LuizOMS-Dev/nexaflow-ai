"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Modal, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import type { PlanRow } from "../types";
import { EmptyHint, ErrorHint, Field, PageHeader, Skeleton, ToneBadge, inputClass } from "../ui";

export function PlansPage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<PlanRow | null>(null);

  const q = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => platformAdminApi.plans(false),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  const mut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      platformAdminApi.patchPlan(id, body),
    onSuccess: () => {
      toast({
        title: "Catálogo atualizado",
        description: "As alterações foram salvas. Contratos vigentes permanecem inalterados.",
        kind: "success",
      });
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["platform-plans"] });
    },
    onError: (e) =>
      toast({
        title: "Não foi possível atualizar o catálogo",
        description: e instanceof Error ? e.message : "Erro ao salvar alterações no plano.",
        kind: "error",
      }),
  });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return <ErrorHint title="Não foi possível carregar os planos" onRetry={() => void q.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="Planos e limites"
        description="Catálogo oficial. Alterar preço aqui não muda o valor já contratado por uma empresa."
      />
      {q.data.length === 0 ? (
        <EmptyHint title="Nenhum plano">Cadastre planos no seed ou via API.</EmptyHint>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((p) => (
            <article
              key={p.id}
              className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 transition-colors hover:border-white/[0.1]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold text-white">{p.name}</h2>
                  <p className="text-[12px] text-white/40">{p.slug}</p>
                </div>
                <ToneBadge code={p.isActive ? "ACTIVE" : "CANCELLED"}>
                  {p.isActive ? "Ativo" : "Inativo"}
                </ToneBadge>
              </div>
              <p className="mt-3 font-display text-[1.35rem] font-semibold tabular-nums text-white">
                {p.priceOnRequest ? "Sob consulta" : formatCurrency(Number(p.priceMonthly || 0))}
                {!p.priceOnRequest ? (
                  <span className="ml-1 text-[12px] font-normal text-white/40">/mês</span>
                ) : null}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <dt className="text-white/40">Empresas</dt>
                  <dd className="font-medium tabular-nums text-white/85">{p._count?.tenants ?? 0}</dd>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <dt className="text-white/40">Usuários</dt>
                  <dd className="font-medium tabular-nums text-white/85">{p.maxUsers}</dd>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <dt className="text-white/40">Contatos</dt>
                  <dd className="font-medium tabular-nums text-white/85">
                    {Number(p.maxContacts || 0).toLocaleString("pt-BR")}
                  </dd>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <dt className="text-white/40">Msgs IA</dt>
                  <dd className="font-medium tabular-nums text-white/85">
                    {Number(p.maxAiMessages || 0).toLocaleString("pt-BR")}
                  </dd>
                </div>
              </dl>
              {p.description ? (
                <p className="mt-2 line-clamp-2 text-[13px] text-white/50">{p.description}</p>
              ) : null}
              <button
                type="button"
                className="admin-btn-secondary mt-auto h-8 w-full text-[12px]"
                style={{ marginTop: "0.75rem" }}
                onClick={() => setEdit(p)}
              >
                Editar plano
              </button>
            </article>
          ))}
        </div>
      )}

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? `Editar ${edit.name}` : ""}>
        {edit ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              mut.mutate({
                id: edit.id,
                body: {
                  name: String(fd.get("name") || ""),
                  description: String(fd.get("description") || "") || null,
                  priceMonthly: Number(fd.get("priceMonthly") || 0),
                  priceOnRequest: fd.get("priceOnRequest") === "on",
                  maxUsers: Number(fd.get("maxUsers") || 1),
                  maxContacts: Number(fd.get("maxContacts") || 0),
                  maxChannels: Number(fd.get("maxChannels") || 1),
                  maxAiMessages: Number(fd.get("maxAiMessages") || 0),
                  isActive: fd.get("isActive") === "on",
                },
              });
            }}
          >
            <Field label="Nome">
              <input name="name" defaultValue={edit.name} className={inputClass} />
            </Field>
            <Field label="Preço mensal">
              <input
                name="priceMonthly"
                type="number"
                min={0}
                step="0.01"
                defaultValue={Number(edit.priceMonthly || 0)}
                className={inputClass}
              />
            </Field>
            <Field label="Usuários">
              <input name="maxUsers" type="number" min={1} defaultValue={edit.maxUsers || 1} className={inputClass} />
            </Field>
            <Field label="Contatos">
              <input
                name="maxContacts"
                type="number"
                min={0}
                defaultValue={edit.maxContacts || 0}
                className={inputClass}
              />
            </Field>
            <Field label="Canais">
              <input
                name="maxChannels"
                type="number"
                min={1}
                defaultValue={edit.maxChannels || 1}
                className={inputClass}
              />
            </Field>
            <Field label="Msgs IA / mês">
              <input
                name="maxAiMessages"
                type="number"
                min={0}
                defaultValue={edit.maxAiMessages || 0}
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-white/70">
              <input name="isActive" type="checkbox" defaultChecked={edit.isActive !== false} />
              Ativo no catálogo
            </label>
            <label className="flex items-center gap-2 text-[13px] text-white/70">
              <input name="priceOnRequest" type="checkbox" defaultChecked={Boolean(edit.priceOnRequest)} />
              Preço sob consulta
            </label>
            <div className="sm:col-span-2">
              <Field label="Descrição">
                <input name="description" defaultValue={edit.description || ""} className={inputClass} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="admin-btn-ghost" onClick={() => setEdit(null)}>
                Cancelar
              </button>
              <button type="submit" className="admin-btn-primary" disabled={mut.isPending}>
                Salvar
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
