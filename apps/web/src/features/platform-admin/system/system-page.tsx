"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Sliders, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import {
  ErrorHint,
  Field,
  PageHeader,
  Panel,
  Skeleton,
  ToneBadge,
  inputClass,
} from "../ui";
import { cn } from "@/lib/utils";
import { MaintenancePanel } from "./maintenance-panel";

type Tab = "politica" | "manutencao";

export function SystemPage({ initialTab = "politica" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sistema"
        description="Configure políticas de acesso e disponibilidade da plataforma."
      />
      <div className="admin-tabs">
        {(
          [
            ["politica", "Política de acesso"],
            ["manutencao", "Modo de Manutenção"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="admin-tab"
            data-active={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "politica" ? <PolicyPanel /> : null}
      {tab === "manutencao" ? <MaintenancePanel /> : null}
    </div>
  );
}

function PolicyPanel() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["platform-access-policy"],
    queryFn: () => platformAdminApi.accessPolicy(),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const [graceDays, setGraceDays] = useState<number>(5);
  const [suspendMode, setSuspendMode] = useState<"LIMITED" | "TOTAL">("LIMITED");
  const [autoSuspend, setAutoSuspend] = useState<boolean>(false);

  // Sincroniza dados iniciais da query
  useState(() => {
    if (q.data) {
      setGraceDays(q.data.graceDays ?? 5);
      setSuspendMode(q.data.companySuspendMode === "TOTAL" ? "TOTAL" : "LIMITED");
      setAutoSuspend(Boolean(q.data.autoSuspendNonpayment));
    }
  });

  const mut = useMutation({
    mutationFn: platformAdminApi.putAccessPolicy,
    onSuccess: () => {
      toast({
        title: "Política de acesso atualizada",
        description: "As regras de suspensão e carência financeira foram salvas com sucesso.",
        kind: "success",
      });
      void qc.invalidateQueries({ queryKey: ["platform-access-policy"] });
    },
    onError: (e) =>
      toast({
        title: "Não foi possível salvar a política",
        description: e instanceof Error ? e.message : "Erro ao aplicar configurações de acesso.",
        kind: "error",
      }),
  });

  if (q.isLoading) return <Skeleton rows={4} />;
  if (q.error || !q.data) {
    return <ErrorHint title="Não foi possível carregar a política" onRetry={() => void q.refetch()} />;
  }

  const currentGrace = q.data.graceDays ?? 5;
  const currentMode = q.data.companySuspendMode ?? "LIMITED";
  const currentAuto = Boolean(q.data.autoSuspendNonpayment);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsedGrace = Math.max(0, Math.min(90, Number(fd.get("graceDays")) || 0));
    const parsedMode = (String(fd.get("companySuspendMode")) as "LIMITED" | "TOTAL") || "LIMITED";
    const parsedAuto = fd.get("autoSuspendNonpayment") === "on";

    mut.mutate({
      graceDays: parsedGrace,
      companySuspendMode: parsedMode,
      autoSuspendNonpayment: parsedAuto,
    });
  }

  return (
    <Panel title="Política de acesso financeiro">
      <p className="mb-6 text-xs text-white/60 sm:text-sm">
        Defina como o acesso das empresas será tratado após o vencimento de faturas e planos.
      </p>

      <form className="space-y-6 max-w-2xl" onSubmit={onSubmit}>
        {/* Bloco 1: Inadimplência & Carência */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Inadimplência e Tolerância</h4>
              <p className="text-xs text-white/50">Prazo de carência concedido após a data de vencimento da fatura.</p>
            </div>
          </div>

          <Field
            label="Dias de tolerância"
            hint="Período em dias antes de o Access Gate aplicar medidas de restrição (0 a 90 dias)."
          >
            <div className="relative max-w-xs">
              <input
                name="graceDays"
                type="number"
                min={0}
                max={90}
                defaultValue={currentGrace}
                className={inputClass}
                required
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-white/40">
                dias
              </span>
            </div>
          </Field>
        </div>

        {/* Bloco 2: Comportamento após tolerância */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Comportamento após tolerância</h4>
              <p className="text-xs text-white/50">Nível de restrição de navegação aplicado às empresas inadimplentes.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={cn(
                "relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all",
                "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]"
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="companySuspendMode"
                  value="LIMITED"
                  defaultChecked={currentMode === "LIMITED"}
                  className="mt-0.5 text-brand-600 focus:ring-brand-500"
                />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">Acesso Limitado</p>
                  <p className="text-[11px] leading-relaxed text-white/50">
                    Permite visualizar faturas e configurações para regularização do pagamento.
                  </p>
                </div>
              </div>
            </label>

            <label
              className={cn(
                "relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all",
                "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]"
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="companySuspendMode"
                  value="TOTAL"
                  defaultChecked={currentMode === "TOTAL"}
                  className="mt-0.5 text-brand-600 focus:ring-brand-500"
                />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">Bloqueio Total</p>
                  <p className="text-[11px] leading-relaxed text-white/50">
                    Impede o acesso completo à plataforma até a quitação das pendências.
                  </p>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Bloco 3: Automação */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="space-y-0.5">
              <span className="text-sm font-semibold text-white">
                Suspender automaticamente por inadimplência
              </span>
              <p className="text-xs text-white/50 leading-relaxed">
                Quando ativado, o sistema altera o status das empresas automaticamente para SUSPENDED após o término da carência.
              </p>
            </div>
            <input
              name="autoSuspendNonpayment"
              type="checkbox"
              defaultChecked={currentAuto}
              className="mt-1 h-5 w-5 rounded border-white/20 bg-black/40 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Barra de Ações */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <ToneBadge code="ACTIVE">Política ativa</ToneBadge>
            <span className="text-xs text-white/40">Aplicada em tempo real pelo Access Gate</span>
          </div>

          <button
            type="submit"
            disabled={mut.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {mut.isPending ? "Salvando…" : "Salvar política"}
          </button>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.01] p-3.5 text-xs text-white/50">
          <AlertCircle className="h-4 w-4 shrink-0 text-white/40 mt-0.5" />
          <p className="leading-relaxed">
            Esta política define as regras canônicas de acesso operacional. Webhooks de pagamento (Stripe, Mercado Pago, Asaas) atualizam a regularização de forma instantânea.
          </p>
        </div>
      </form>
    </Panel>
  );
}
