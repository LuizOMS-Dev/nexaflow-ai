"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ApiError, isStepUpRequiredError, isSuperadminMfaRequiredError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Modal, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import { FINANCIAL_LABEL, ROLE_LABEL, STATUS_LABEL, actionLabel, usageLabel } from "../labels";
import { EmptyHint, ErrorHint, Field, PageHeader, Skeleton, ToneBadge, inputClass } from "../ui";
import type { CompanyAction } from "../types";

type Tab = "resumo" | "equipe" | "cobranca" | "uso" | "auditoria";

export function CompanyDetailPage({ id }: { id: string }) {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("resumo");
  const [impOpen, setImpOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const q = useQuery({
    queryKey: ["platform-company", id],
    queryFn: () => platformAdminApi.company(id),
    enabled: user?.platformRole === "SUPERADMIN" && Boolean(id),
    retry: false,
  });

  const plans = useQuery({
    queryKey: ["platform-plans-commercial"],
    queryFn: () => platformAdminApi.plans(true),
    staleTime: 60_000,
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => platformAdminApi.patchCompany(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform-company", id] });
      toast({
        title: "Empresa atualizada",
        description: "As alterações foram salvas com sucesso.",
        kind: "success",
      });
    },
    onError: (e) =>
      toast({
        title: "Não foi possível atualizar a empresa",
        description: e instanceof Error ? e.message : "Erro ao processar as alterações.",
        kind: "error",
      }),
  });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return <ErrorHint title="Não foi possível abrir a empresa" onRetry={() => void q.refetch()} />;
  }

  const c = q.data;

  async function runAction(action: CompanyAction, extra?: Record<string, unknown>) {
    patch.mutate({ action, ...extra });
  }

  return (
    <div>
      <PageHeader
        title={c.name}
        description={`${c.slug} · ${c.plan?.name || "Sem plano"}`}
        breadcrumbs={[
          { label: "Empresas", href: "/admin/companies" },
          { label: c.name },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => setImpOpen(true)}>
              Entrar na empresa
            </button>
            <button type="button" className="admin-btn-secondary" onClick={() => setPayOpen(true)}>
              Registrar pagamento
            </button>
            {c.status === "ACTIVE" || c.status === "TRIAL" ? (
              <button type="button" className="admin-btn-secondary" onClick={() => runAction("suspend")}>
                Suspender
              </button>
            ) : null}
            {c.status === "SUSPENDED" || c.status === "BLOCKED" ? (
              <button type="button" className="admin-btn-primary" onClick={() => runAction("reactivate")}>
                Reativar
              </button>
            ) : null}
            {c.status !== "BLOCKED" ? (
              <button type="button" className="admin-btn-danger" onClick={() => runAction("block")}>
                Bloquear
              </button>
            ) : (
              <button type="button" className="admin-btn-secondary" onClick={() => runAction("unblock")}>
                Desbloquear
              </button>
            )}
            {c.status !== "PENDING_DELETION" ? (
              <button type="button" className="admin-btn-ghost text-red-200" onClick={() => setDelOpen(true)}>
                Solicitar exclusão
              </button>
            ) : (
              <button type="button" className="admin-btn-secondary" onClick={() => runAction("cancel_deletion")}>
                Cancelar exclusão
              </button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <ToneBadge code={c.status}>{c.statusLabel || STATUS_LABEL[c.status]}</ToneBadge>
        <ToneBadge code={c.financialStatus}>
          {c.financialStatusLabel || FINANCIAL_LABEL[c.financialStatus || ""] || "—"}
        </ToneBadge>
        {c.contractedPrice != null ? (
          <span className="text-[12px] text-white/45">Contrato {formatCurrency(c.contractedPrice)}</span>
        ) : null}
      </div>

      <div className="admin-tabs">
        {(
          [
            ["resumo", "Resumo"],
            ["equipe", "Equipe"],
            ["cobranca", "Cobrança"],
            ["uso", "Uso"],
            ["auditoria", "Auditoria"],
          ] as const
        ).map(([idTab, label]) => (
          <button
            key={idTab}
            type="button"
            className="admin-tab"
            data-active={tab === idTab}
            onClick={() => setTab(idTab)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "resumo" ? (
        <form
          className="grid max-w-2xl gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            patch.mutate({
              name: String(fd.get("name") || ""),
              planId: String(fd.get("planId") || "") || null,
              segment: String(fd.get("segment") || "") || null,
              phone: String(fd.get("phone") || "") || null,
              commercialEmail: String(fd.get("commercialEmail") || "") || null,
            });
          }}
        >
          <Field label="Nome">
            <input name="name" defaultValue={c.name} className={inputClass} />
          </Field>
          <Field label="Plano">
            <select name="planId" defaultValue={c.planId || ""} className={inputClass}>
              <option value="">Sem plano</option>
              {(plans.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Segmento">
            <input name="segment" defaultValue={c.profile?.segment || ""} className={inputClass} />
          </Field>
          <Field label="Telefone">
            <input name="phone" defaultValue={c.profile?.phone || ""} className={inputClass} />
          </Field>
          <Field label="E-mail comercial">
            <input
              name="commercialEmail"
              defaultValue={c.profile?.commercialEmail || ""}
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className="admin-btn-primary" disabled={patch.isPending}>
              Salvar
            </button>
          </div>
        </form>
      ) : null}

      {tab === "equipe" ? (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-white/[0.03] text-[11px] uppercase text-white/40">
              <tr>
                <th className="px-3 py-2 font-medium">Pessoa</th>
                <th className="px-3 py-2 font-medium">Papel</th>
                <th className="px-3 py-2 font-medium">Acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {(c.members || []).map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2.5">
                    <p className="text-white">{m.user.name}</p>
                    <p className="text-[11px] text-white/40">{m.user.email}</p>
                  </td>
                  <td className="px-3 py-2.5 text-white/70">{ROLE_LABEL[m.role] || m.role}</td>
                  <td className="px-3 py-2.5">
                    <ToneBadge code={m.isActive ? "ACTIVE" : "DISABLED"}>
                      {m.isActive ? "Ativo" : "Inativo"}
                    </ToneBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(c.members || []).length === 0 ? <EmptyHint>Nenhum membro.</EmptyHint> : null}
        </div>
      ) : null}

      {tab === "cobranca" ? (
        <div className="space-y-4">
          <form
            className="grid max-w-xl gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const due = String(fd.get("billingDueDay") || "");
              const price = String(fd.get("priceMonthly") || "");
              patch.mutate({
                billingDueDay: due ? Number(due) : null,
                priceMonthly: price ? Number(price) : null,
              });
            }}
          >
            <Field label="Dia de vencimento">
              <input
                name="billingDueDay"
                type="number"
                min={1}
                max={31}
                defaultValue={c.billingDueDay ?? c.subscription?.billingDueDay ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Preço contratado (R$)">
              <input
                name="priceMonthly"
                type="number"
                min={0}
                step="0.01"
                defaultValue={c.contractedPrice ?? ""}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[12px] text-white/40">
                Próximo vencimento: {c.nextDueAt ? formatDate(c.nextDueAt) : "—"}
              </p>
              <button type="submit" className="admin-btn-primary" disabled={patch.isPending}>
                Salvar cobrança
              </button>
            </div>
          </form>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-white/[0.03] text-[11px] uppercase text-white/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Método</th>
                  <th className="px-3 py-2 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {(c.payments || []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2.5 text-white/70">{formatDate(p.paidAt)}</td>
                    <td className="px-3 py-2.5 text-white">{formatCurrency(p.amount)}</td>
                    <td className="px-3 py-2.5 text-white/50">{p.method || "—"}</td>
                    <td className="px-3 py-2.5 text-white/50">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(c.payments || []).length === 0 ? <EmptyHint>Nenhum pagamento registrado.</EmptyHint> : null}
          </div>
        </div>
      ) : null}

      {tab === "uso" ? (
        Object.keys(c.usage || {}).length === 0 ? (
          <EmptyHint title="Sem métricas de uso">Ainda não há contagens para esta empresa.</EmptyHint>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(c.usage || {}).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-white/40">{usageLabel(k)}</dt>
                <dd className="mt-1 text-[18px] font-semibold tabular-nums text-white">
                  {Number(v).toLocaleString("pt-BR")}
                  {c.limits && c.limits[k] != null ? (
                    <span className="ml-1 text-[12px] font-normal text-white/35">
                      / {Number(c.limits[k]).toLocaleString("pt-BR")}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        )
      ) : null}

      {tab === "auditoria" ? (
        <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
          {(c.auditLogs || []).map((log) => (
            <li key={log.id} className="px-4 py-2.5 text-[13px]">
              <p className="text-white/85">{actionLabel(log.action)}</p>
              <p className="text-[11px] text-white/40">
                {log.user?.name || log.user?.email || "Sistema"} · {formatDate(log.createdAt)}
              </p>
            </li>
          ))}
          {(c.auditLogs || []).length === 0 ? <EmptyHint>Sem eventos.</EmptyHint> : null}
        </ul>
      ) : null}

      <ImpersonateModal
        open={impOpen}
        onClose={() => setImpOpen(false)}
        tenantId={c.id}
        onDone={() => router.replace("/app")}
      />
      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        tenantId={c.id}
        onDone={() => void qc.invalidateQueries({ queryKey: ["platform-company", id] })}
      />
      <DeleteModal
        open={delOpen}
        name={c.name}
        onClose={() => setDelOpen(false)}
        onConfirm={async (confirmName, reason) => {
          try {
            await platformAdminApi.deleteCompany(c.id, {
              confirmName,
              acknowledged: true,
              mode: "now",
              reason,
            });
            toast({
              title: "Exclusão solicitada",
              description: "O pedido de exclusão foi registrado e os dados foram preservados.",
              kind: "success",
            });
            setDelOpen(false);
            void qc.invalidateQueries({ queryKey: ["platform-company", id] });
          } catch (e) {
            toast({
              title: "Não foi possível solicitar exclusão",
              description: e instanceof Error ? e.message : "Erro ao processar a solicitação.",
              kind: "error",
            });
          }
        }}
      />
    </div>
  );
}

function ImpersonateModal({
  open,
  onClose,
  tenantId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const setSession = useAuth((s) => s.setSession);
  const mut = useMutation({
    mutationFn: (reason: string) => platformAdminApi.impersonate({ tenantId, reason }),
    onSuccess: (data) => {
      try {
        sessionStorage.setItem("nexaflow_impersonating", "1");
      } catch {
        /* ignore */
      }
      setSession({
        token: data.accessToken,
        user: data.user,
        tenant: data.tenant,
        memberships: [],
      });
      toast({
        title: "Acesso iniciado",
        description: "Sessão de suporte iniciada na empresa.",
        kind: "success",
      });
      window.location.href = "/app";
      onDone();
    },
    onError: (e) => {
      if (isStepUpRequiredError(e) || (e instanceof ApiError && e.code === "MFA_REQUIRED_SUPERADMIN")) {
        toast({
          title: "MFA Obrigatório",
          description: "Confirme a verificação em duas etapas para continuar.",
          kind: "warning",
        });
        return;
      }
      toast({
        title: "Não foi possível entrar",
        description: e instanceof Error ? e.message : "Erro na autenticação de suporte.",
        kind: "error",
      });
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Entrar na empresa">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const reason = String(new FormData(e.currentTarget).get("reason") || "");
          mut.mutate(reason);
        }}
      >
        <p className="text-[13px] text-white/55">
          Você opera com o papel do administrador da empresa. A ação é auditada e expira em 2 horas.
        </p>
        <Field label="Motivo (obrigatório, mínimo 8 caracteres)">
          <input name="reason" required minLength={8} className={inputClass} placeholder="Suporte ao cliente X" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn-primary" disabled={mut.isPending}>
            Entrar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentModal({
  open,
  onClose,
  tenantId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: (body: { amount: number; method?: string; notes?: string }) =>
      platformAdminApi.registerPayment(tenantId, body),
    onSuccess: () => {
      toast({
        title: "Pagamento registrado",
        description: "O lançamento financeiro foi processado com sucesso.",
        kind: "success",
      });
      onClose();
      onDone();
    },
    onError: (e) =>
      toast({
        title: "Não foi possível registrar o pagamento",
        description: e instanceof Error ? e.message : "Erro ao processar o pagamento.",
        kind: "error",
      }),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mut.mutate({
      amount: Number(fd.get("amount")),
      method: String(fd.get("method") || "") || undefined,
      notes: String(fd.get("notes") || "") || undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar pagamento">
      <form className="space-y-3" onSubmit={onSubmit}>
        <Field label="Valor (R$)">
          <input name="amount" type="number" min={0.01} step="0.01" required className={inputClass} />
        </Field>
        <Field label="Método">
          <select name="method" className={inputClass} defaultValue="PIX">
            <option>PIX</option>
            <option>TRANSFER</option>
            <option>BOLETO</option>
            <option>CARD</option>
            <option>CASH</option>
            <option>OTHER</option>
          </select>
        </Field>
        <Field label="Nota">
          <input name="notes" className={inputClass} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn-primary" disabled={mut.isPending}>
            Registrar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteModal({
  open,
  name,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: (confirmName: string, reason?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Solicitar exclusão">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await onConfirm(String(fd.get("confirmName") || ""), String(fd.get("reason") || "") || undefined);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-[13px] text-white/55">
          Os dados não são apagados. A empresa fica sem acesso até um processo definitivo.
          Digite <strong className="text-white">{name}</strong> para confirmar.
        </p>
        <Field label="Nome da empresa">
          <input name="confirmName" required className={inputClass} />
        </Field>
        <Field label="Motivo">
          <input name="reason" className={inputClass} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn-danger" disabled={busy}>
            Solicitar exclusão
          </button>
        </div>
      </form>
    </Modal>
  );
}
