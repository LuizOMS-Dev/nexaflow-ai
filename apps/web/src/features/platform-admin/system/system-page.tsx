"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Sliders, Save, CheckCircle2, AlertCircle, Clock, ShieldAlert, Sparkles } from "lucide-react";
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
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const defaultTab = (urlTab === "manutencao" || urlTab === "politica") ? urlTab : initialTab;
  const [tab, setTab] = useState<Tab>(defaultTab);

  useEffect(() => {
    if (urlTab === "manutencao" || urlTab === "politica") {
      setTab(urlTab);
    }
  }, [urlTab]);
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

  const [graceDays, setGraceDays] = useState<number>(7);
  const [suspendMode, setSuspendMode] = useState<"LIMITED" | "TOTAL">("LIMITED");
  const [autoSuspend, setAutoSuspend] = useState<boolean>(false);

  useEffect(() => {
    if (q.data) {
      setGraceDays(q.data.graceDays ?? 7);
      setSuspendMode(q.data.companySuspendMode === "TOTAL" ? "TOTAL" : "LIMITED");
      setAutoSuspend(Boolean(q.data.autoSuspendNonpayment));
    }
  }, [q.data]);

  const mut = useMutation({
    mutationFn: platformAdminApi.putAccessPolicy,
    onSuccess: () => {
      toast({
        title: "Política de acesso atualizada",
        description: "As regras de tolerância e suspensão automática foram salvas com sucesso.",
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsedGrace = Math.max(0, Math.min(90, Number(graceDays) || 0));

    mut.mutate({
      graceDays: parsedGrace,
      companySuspendMode: suspendMode,
      autoSuspendNonpayment: autoSuspend,
    });
  }

  return (
    <Panel title="Política de acesso financeiro">
      <p className="mb-6 text-xs text-white/60 sm:text-sm">
        Defina como o acesso das empresas será tratado após o vencimento de faturas e planos.
      </p>

      <form className="space-y-6" onSubmit={onSubmit}>
        {/* Grid de 2 Colunas para Desktop (100% de largura aproveitada) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: Inadimplência e Tolerância */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Inadimplência e Tolerância</h4>
                  <p className="text-xs text-white/50">Prazo de carência concedido após a data de vencimento da fatura.</p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label htmlFor="grace-days-input" className="block text-xs font-medium text-white/80">
                  Dias de tolerância
                </label>
                <div className="relative">
                  <input
                    id="grace-days-input"
                    type="number"
                    min={0}
                    max={90}
                    value={graceDays}
                    onChange={(e) => setGraceDays(Math.max(0, Math.min(90, Number(e.target.value) || 0)))}
                    className={cn(inputClass, "pr-14 text-sm font-semibold")}
                    required
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                    dias
                  </span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Período concedido antes de qualquer ação restritiva (permitido de 0 a 90 dias).
                </p>
              </div>
            </div>

            {/* Atalhos Rápidos de Dias */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
              <span className="text-[11px] text-white/40">Sugestões:</span>
              {[3, 5, 7, 10, 15, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setGraceDays(d)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    graceDays === d
                      ? "bg-brand-600 text-white font-semibold shadow-sm"
                      : "bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  {d} dias
                </button>
              ))}
            </div>
          </div>

          {/* Card 2: Comportamento após tolerância (RadioGroup Oficial) */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Comportamento após tolerância</h4>
                  <p className="text-xs text-white/50">Nível de restrição aplicado às empresas inadimplentes.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-1" role="radiogroup" aria-label="Modo de suspensão">
                {/* Opção 1: Acesso Limitado */}
                <div
                  role="radio"
                  tabIndex={0}
                  aria-checked={suspendMode === "LIMITED"}
                  onClick={() => setSuspendMode("LIMITED")}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setSuspendMode("LIMITED");
                    }
                  }}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    suspendMode === "LIMITED"
                      ? "border-brand-500/50 bg-brand-500/10 ring-1 ring-brand-500/30"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all",
                        suspendMode === "LIMITED"
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-white/30 bg-transparent group-hover:border-white/50"
                      )}
                    >
                      {suspendMode === "LIMITED" ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-white">Acesso Limitado</p>
                      <p className="text-[11px] leading-relaxed text-white/50">
                        Permite à empresa visualizar faturas e configurações para regularização do pagamento.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Opção 2: Bloqueio Total */}
                <div
                  role="radio"
                  tabIndex={0}
                  aria-checked={suspendMode === "TOTAL"}
                  onClick={() => setSuspendMode("TOTAL")}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setSuspendMode("TOTAL");
                    }
                  }}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    suspendMode === "TOTAL"
                      ? "border-brand-500/50 bg-brand-500/10 ring-1 ring-brand-500/30"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all",
                        suspendMode === "TOTAL"
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-white/30 bg-transparent group-hover:border-white/50"
                      )}
                    >
                      {suspendMode === "TOTAL" ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-white">Bloqueio Total</p>
                      <p className="text-[11px] leading-relaxed text-white/50">
                        Interrompe o acesso à plataforma até a quitação completa das pendências.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06] text-[11px] text-white/40">
              Modo atual: <strong className="text-white/70">{suspendMode === "LIMITED" ? "Acesso Limitado" : "Bloqueio Total"}</strong>
            </div>
          </div>
        </div>

        {/* Card 3: Automação com Switch Oficial do Design System */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  Aplicar restrição automaticamente após a tolerância
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    autoSuspend
                      ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                      : "bg-white/[0.06] text-white/50"
                  )}
                >
                  {autoSuspend ? "Ativo" : "Desativado"}
                </span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Quando ativado, o sistema aplica a restrição financeira configurada (<strong>Acesso Limitado</strong> ou <strong>Bloqueio Total</strong>) às empresas com faturas vencidas após o término dos dias de tolerância.
              </p>
            </div>

            {/* Switch Oficial Acessível */}
            <button
              type="button"
              role="switch"
              aria-checked={autoSuspend}
              aria-label="Aplicar restrição automaticamente após a tolerância"
              onClick={() => setAutoSuspend((v) => !v)}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                autoSuspend ? "bg-brand-600" : "bg-white/15"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                  autoSuspend ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        {/* Barra Inferior de Ações e Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Política aplicada em tempo real
            </span>
            <span className="text-xs text-white/40">Atualização imediata para todas as empresas</span>
          </div>

          <button
            type="submit"
            disabled={mut.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {mut.isPending ? "Salvando…" : "Salvar política"}
          </button>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.01] p-3.5 text-xs text-white/50">
          <AlertCircle className="h-4 w-4 shrink-0 text-white/40 mt-0.5" />
          <p className="leading-relaxed">
            Esta política define as regras operacionais de acesso. Quando o pagamento é identificado, a restrição financeira é removida automaticamente e o acesso correspondente é restabelecido.
          </p>
        </div>
      </form>
    </Panel>
  );
}
