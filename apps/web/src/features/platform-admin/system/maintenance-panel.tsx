"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Eye,
  Lock,
  Save,
  Radio,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { platformAdminApi } from "../api";
import {
  EmptyHint,
  ErrorHint,
  Field,
  Panel,
  Skeleton,
  ToneBadge,
  inputClass,
} from "../ui";
import { cn } from "@/lib/utils";
import { MaintenanceScreen } from "@/components/maintenance/maintenance-screen";

export function MaintenancePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["platform-maintenance"],
    queryFn: () => platformAdminApi.maintenance(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [estimatedEnd, setEstimatedEnd] = useState("");
  const [internalReason, setInternalReason] = useState("");

  // Modais de confirmação
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [ackBlock, setAckBlock] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);

  useEffect(() => {
    if (q.data) {
      setEnabled(Boolean(q.data.enabled));
      setTitle(q.data.title || "Estamos em manutenção");
      setMessage(
        q.data.message ||
          "Estamos realizando melhorias no NexaFlow para oferecer uma experiência ainda melhor. Voltaremos em breve."
      );
      setEstimatedEnd(q.data.estimatedEnd || "");
      setInternalReason(q.data.internalReason || "");
    }
  }, [q.data]);

  const mutation = useMutation({
    mutationFn: (params: {
      enabled: boolean;
      title?: string;
      message?: string;
      estimatedEnd?: string | null;
      internalReason?: string | null;
    }) => platformAdminApi.updateMaintenance(params),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["platform-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["public-maintenance-status"] });
      toast({
        title: res.state.enabled
          ? "Modo de manutenção ativado"
          : "Modo de manutenção desativado",
        description: res.state.enabled
          ? "O acesso das empresas foi bloqueado com sucesso."
          : "O acesso das empresas foi liberado com sucesso.",
        kind: "success",
      });
      setShowEnableModal(false);
      setShowDisableModal(false);
      setAckBlock(false);
    },
    onError: (err) => {
      toast({
        title: "Erro ao alterar modo de manutenção",
        description: err instanceof Error ? err.message : "Erro interno",
        kind: "error",
      });
    },
  });

  if (q.isLoading) return <Skeleton rows={3} />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return (
      <ErrorHint
        title="Não foi possível ler as configurações de manutenção"
        onRetry={() => void q.refetch()}
      />
    );
  }

  const handleToggleClick = () => {
    if (!enabled) {
      setAckBlock(false);
      setShowEnableModal(true);
    } else {
      setShowDisableModal(true);
    }
  };

  const handleConfirmEnable = () => {
    if (!ackBlock) return;
    mutation.mutate({
      enabled: true,
      title: title.trim(),
      message: message.trim(),
      estimatedEnd: estimatedEnd.trim() || null,
      internalReason: internalReason.trim() || null,
    });
  };

  const handleConfirmDisable = () => {
    mutation.mutate({
      enabled: false,
      title: title.trim(),
      message: message.trim(),
      estimatedEnd: estimatedEnd.trim() || null,
      internalReason: internalReason.trim() || null,
    });
  };

  const handleSaveConfigOnly = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      enabled,
      title: title.trim(),
      message: message.trim(),
      estimatedEnd: estimatedEnd.trim() || null,
      internalReason: internalReason.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Banner Principal de Status */}
      <div
        className={cn(
          "rounded-2xl border p-5 transition-colors",
          enabled
            ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-200"
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {enabled ? (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Wrench className="h-5 w-5 animate-pulse" />
              </div>
            ) : (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base sm:text-lg">
                  {enabled ? "Modo de Manutenção Ativo" : "Sistema Operando Normalmente"}
                </h3>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    enabled
                      ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-black"
                      : "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-black"
                  )}
                >
                  {enabled ? "EM MANUTENÇÃO" : "ONLINE"}
                </span>
              </div>
              <p className="mt-1 text-xs opacity-90 sm:text-sm">
                {enabled
                  ? "O acesso dos usuários de empresas está bloqueado (UI e APIs). O Superadmin continua com acesso total."
                  : "Todas as empresas e usuários possuem acesso livre à plataforma."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleClick}
              disabled={mutation.isPending}
              className={cn(
                "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-50",
                enabled
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                  : "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
              )}
            >
              {enabled ? "Encerrar Manutenção" : "Ativar Modo de Manutenção"}
            </button>
          </div>
        </div>
      </div>

      {/* Formulário de Configuração */}
      <Panel title="Configurações de Exibição e Mensagem">
        <p className="mb-4 text-xs text-white/50">
          Textos que serão apresentados aos usuários das empresas quando a manutenção estiver ativa.
        </p>
        <form onSubmit={handleSaveConfigOnly} className="space-y-4">
          <Field
            label="Título da tela de manutenção"
            hint="Exemplo padrão: Estamos em manutenção"
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Estamos em manutenção"
              className={inputClass}
              maxLength={200}
              required
            />
          </Field>

          <Field
            label="Mensagem explicativa"
            hint="Explique brevemente que a plataforma está recebendo melhorias e voltará em breve."
          >
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Estamos realizando melhorias no NexaFlow para oferecer uma experiência ainda melhor. Voltaremos em breve."
              rows={3}
              className={inputClass}
              maxLength={2000}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Previsão de retorno (opcional)"
              hint="Ex: 04:30, 21/08 às 05:00 ou 30 minutos"
            >
              <input
                type="text"
                value={estimatedEnd}
                onChange={(e) => setEstimatedEnd(e.target.value)}
                placeholder="Ex: 04:30 ou 2026-08-21 05:00"
                className={inputClass}
                maxLength={100}
              />
            </Field>

            <Field
              label="Motivo interno (apenas Superadmin)"
              hint="Visível somente para a equipe técnica administrativa nos logs."
            >
              <input
                type="text"
                value={internalReason}
                onChange={(e) => setInternalReason(e.target.value)}
                placeholder="Ex: Migração de banco de dados e atualização de nós"
                className={inputClass}
                maxLength={500}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowLivePreview(!showLivePreview)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.1] bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              <Eye className="h-4 w-4" />
              {showLivePreview ? "Ocultar pré-visualização" : "Pré-visualizar tela dos clientes"}
            </button>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {mutation.isPending ? "Salvando…" : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </Panel>

      {/* Pré-visualização ao vivo */}
      {showLivePreview && (
        <div className="overflow-hidden rounded-2xl border border-black/[0.1] shadow-2xl dark:border-white/[0.1]">
          <div className="flex items-center justify-between border-b border-black/[0.08] bg-zinc-100 px-4 py-2.5 text-xs font-medium text-zinc-600 dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-400">
            <span className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-sky-500" />
              Pré-visualização da Tela de Manutenção (visão do cliente)
            </span>
            <button
              type="button"
              onClick={() => setShowLivePreview(false)}
              className="hover:text-zinc-900 dark:hover:text-white"
            >
              Fechar preview
            </button>
          </div>
          <div className="pointer-events-none origin-top">
            <MaintenanceScreen
              title={title || "Estamos em manutenção"}
              message={message || "Estamos realizando melhorias..."}
              estimatedEnd={estimatedEnd || null}
              showAdminLink={true}
            />
          </div>
        </div>
      )}

      {/* Informações Técnicas e Exceções */}
      <Panel title="Regras e Exceções do Modo de Manutenção">
        <p className="mb-4 text-xs text-white/50">
          Como a plataforma se comporta quando a manutenção está ligada.
        </p>
        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">🔒 Bloqueado</p>
            <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-zinc-600 dark:text-zinc-400">
              <li>Painel das empresas (/app)</li>
              <li>Inbox e conversas operacionais</li>
              <li>Login de clientes (HTTP 503)</li>
              <li>APIs restritas a tenants</li>
            </ul>
          </div>
          <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">🛡️ Superadmin</p>
            <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-zinc-600 dark:text-zinc-400">
              <li>Acesso total a /admin/*</li>
              <li>Login administrativo seguro</li>
              <li>Diagnóstico e logs</li>
              <li>Controle da manutenção</li>
            </ul>
          </div>
          <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">⚡ Infraestrutura Ativa</p>
            <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-zinc-600 dark:text-zinc-400">
              <li>Health checks (/health, /live)</li>
              <li>Webhooks externos (WAHA, Pagamentos)</li>
              <li>Sessões de usuários preservadas</li>
              <li>Workers de background críticos</li>
            </ul>
          </div>
        </div>
      </Panel>

      {/* Modal de Confirmação: ATIVAR */}
      {showEnableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-white p-6 shadow-2xl dark:border-amber-400/30 dark:bg-zinc-900">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Ativar modo de manutenção?
              </h3>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              Usuários das empresas perderão temporariamente o acesso ao NexaFlow. A Administração continuará disponível.
            </p>

            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <label className="flex items-start gap-2.5 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={ackBlock}
                  onChange={(e) => setAckBlock(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span>Entendo que o acesso das empresas será temporariamente bloqueado.</span>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEnableModal(false)}
                disabled={mutation.isPending}
                className="rounded-xl border border-black/[0.1] bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmEnable}
                disabled={!ackBlock || mutation.isPending}
                className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {mutation.isPending ? "Ativando…" : "Ativar manutenção"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: DESATIVAR */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-white p-6 shadow-2xl dark:border-emerald-400/30 dark:bg-zinc-900">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Encerrar modo de manutenção?
              </h3>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              Encerrar manutenção e liberar o acesso das empresas imediatamente? As sessões de usuários ativas voltarão a responder normalmente.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDisableModal(false)}
                disabled={mutation.isPending}
                className="rounded-xl border border-black/[0.1] bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDisable}
                disabled={mutation.isPending}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {mutation.isPending ? "Liberando…" : "Encerrar manutenção"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
