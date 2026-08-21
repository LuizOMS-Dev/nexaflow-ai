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
  Sliders,
  LayoutDashboard,
  MessagesSquare,
  Users,
  Columns3,
  Wallet,
  ListTodo,
  Megaphone,
  GitBranch,
  Sparkles,
  Library,
  UsersRound,
  ChartColumn,
  Settings,
  X,
  Edit3,
} from "lucide-react";
import { useToast } from "@/components/ui";
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
import { SectionMaintenanceView } from "@/components/maintenance/section-maintenance-view";
import {
  TenantSection,
  TENANT_SECTIONS,
  ALL_SECTIONS,
  SectionGroup,
} from "@/lib/maintenance-sections";

const SECTION_ICONS: Record<TenantSection, typeof LayoutDashboard> = {
  HOME: LayoutDashboard,
  CONVERSATIONS: MessagesSquare,
  CONTACTS: Users,
  PIPELINE: Columns3,
  FINANCE: Wallet,
  TASKS: ListTodo,
  CAMPAIGNS: Megaphone,
  FLOWS: GitBranch,
  AGENTS: Sparkles,
  KNOWLEDGE: Library,
  TEAM: UsersRound,
  CHANNELS: Radio,
  REPORTS: ChartColumn,
  SETTINGS: Settings,
};

const GROUPS: SectionGroup[] = ["GERAL", "VENDAS", "AUTOMAÇÃO", "GESTÃO"];

export function MaintenancePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["platform-maintenance"],
    queryFn: () => platformAdminApi.maintenance(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // Estado Global
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalTitle, setGlobalTitle] = useState("");
  const [globalMessage, setGlobalMessage] = useState("");
  const [globalEstimatedEnd, setGlobalEstimatedEnd] = useState("");
  const [globalInternalReason, setGlobalInternalReason] = useState("");

  // Modais de confirmação Global
  const [showGlobalEnableModal, setShowGlobalEnableModal] = useState(false);
  const [showGlobalDisableModal, setShowGlobalDisableModal] = useState(false);
  const [ackGlobalBlock, setAckGlobalBlock] = useState(false);

  // Modal de Configuração de Seção
  const [editingSection, setEditingSection] = useState<TenantSection | null>(null);
  const [secFormEnabled, setSecFormEnabled] = useState(false);
  const [secFormTitle, setSecFormTitle] = useState("");
  const [secFormMessage, setSecFormMessage] = useState("");
  const [secFormEstimatedEnd, setSecFormEstimatedEnd] = useState("");
  const [secFormInternalReason, setSecFormInternalReason] = useState("");

  // Live Preview Tab
  const [previewMode, setPreviewMode] = useState<"global" | TenantSection | null>(null);

  useEffect(() => {
    if (q.data) {
      setGlobalEnabled(Boolean(q.data.enabled));
      setGlobalTitle(q.data.title || "Estamos em manutenção");
      setGlobalMessage(
        q.data.message ||
          "Estamos realizando melhorias no NexaFlow para oferecer uma experiência ainda melhor. Voltaremos em breve."
      );
      setGlobalEstimatedEnd(q.data.estimatedEnd || "");
      setGlobalInternalReason(q.data.internalReason || "");
    }
  }, [q.data]);

  // Mutação Global
  const globalMutation = useMutation({
    mutationFn: (params: {
      enabled: boolean;
      title?: string;
      message?: string;
      estimatedEnd?: string | null;
      internalReason?: string | null;
    }) => platformAdminApi.updateGlobalMaintenance(params),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["platform-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["public-maintenance-status"] });
      toast({
        title: res.state.enabled
          ? "Modo de manutenção global ATIVADO"
          : "Modo de manutenção global DESATIVADO",
        description: res.state.enabled
          ? "O acesso de todas as empresas foi bloqueado com sucesso."
          : "O acesso de todas as empresas foi restabelecido.",
        kind: "success",
      });
      setShowGlobalEnableModal(false);
      setShowGlobalDisableModal(false);
      setAckGlobalBlock(false);
    },
    onError: (err) => {
      toast({
        title: "Erro ao alterar modo de manutenção global",
        description: err instanceof Error ? err.message : "Erro interno",
        kind: "error",
      });
    },
  });

  // Mutação por Seção
  const sectionMutation = useMutation({
    mutationFn: (params: {
      section: TenantSection;
      enabled: boolean;
      title?: string;
      message?: string;
      estimatedEnd?: string | null;
      internalReason?: string | null;
    }) => platformAdminApi.updateSectionMaintenance(params),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["platform-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["public-maintenance-status"] });
      const secMeta = TENANT_SECTIONS[vars.section];
      toast({
        title: vars.enabled
          ? `Manutenção de ${secMeta?.label || vars.section} ATIVADA`
          : `Manutenção de ${secMeta?.label || vars.section} DESATIVADA`,
        description: vars.enabled
          ? `O acesso interativo ao módulo de ${secMeta?.label} foi bloqueado para as empresas.`
          : `O módulo de ${secMeta?.label} voltou a operar normalmente.`,
        kind: "success",
      });
      setEditingSection(null);
    },
    onError: (err) => {
      toast({
        title: "Erro ao atualizar manutenção da seção",
        description: err instanceof Error ? err.message : "Erro interno",
        kind: "error",
      });
    },
  });

  if (q.isLoading) return <Skeleton rows={6} />;
  if (q.error || !q.data) {
    return (
      <ErrorHint
        title="Não foi possível carregar as configurações de manutenção"
        onRetry={() => void q.refetch()}
      />
    );
  }

  const sectionsState = q.data.sections || {};
  const activeSectionsCount = ALL_SECTIONS.filter((sec) => sectionsState[sec]?.enabled).length;

  const handleGlobalToggleClick = () => {
    if (!globalEnabled) {
      setShowGlobalEnableModal(true);
    } else {
      setShowGlobalDisableModal(true);
    }
  };

  const handleConfirmGlobalEnable = () => {
    if (!ackGlobalBlock) return;
    globalMutation.mutate({
      enabled: true,
      title: globalTitle.trim(),
      message: globalMessage.trim(),
      estimatedEnd: globalEstimatedEnd.trim() || null,
      internalReason: globalInternalReason.trim() || null,
    });
  };

  const handleConfirmGlobalDisable = () => {
    globalMutation.mutate({
      enabled: false,
      title: globalTitle.trim(),
      message: globalMessage.trim(),
      estimatedEnd: globalEstimatedEnd.trim() || null,
      internalReason: globalInternalReason.trim() || null,
    });
  };

  const handleSaveGlobalConfigOnly = (e: FormEvent) => {
    e.preventDefault();
    globalMutation.mutate({
      enabled: globalEnabled,
      title: globalTitle.trim(),
      message: globalMessage.trim(),
      estimatedEnd: globalEstimatedEnd.trim() || null,
      internalReason: globalInternalReason.trim() || null,
    });
  };

  const handleOpenSectionModal = (sec: TenantSection) => {
    const s = sectionsState[sec];
    const meta = TENANT_SECTIONS[sec];
    setEditingSection(sec);
    setSecFormEnabled(Boolean(s?.enabled));
    setSecFormTitle(s?.title || meta?.defaultTitle || "");
    setSecFormMessage(s?.message || meta?.defaultMessage || "");
    setSecFormEstimatedEnd(s?.estimatedEnd || "");
    setSecFormInternalReason(s?.internalReason || "");
  };

  const handleSaveSectionModal = (e: FormEvent) => {
    e.preventDefault();
    if (!editingSection) return;
    sectionMutation.mutate({
      section: editingSection,
      enabled: secFormEnabled,
      title: secFormTitle.trim(),
      message: secFormMessage.trim(),
      estimatedEnd: secFormEstimatedEnd.trim() || null,
      internalReason: secFormInternalReason.trim() || null,
    });
  };

  const handleQuickToggleSection = (sec: TenantSection) => {
    const s = sectionsState[sec];
    const meta = TENANT_SECTIONS[sec];
    const nextEnabled = !s?.enabled;
    sectionMutation.mutate({
      section: sec,
      enabled: nextEnabled,
      title: s?.title || meta?.defaultTitle,
      message: s?.message || meta?.defaultMessage,
      estimatedEnd: s?.estimatedEnd || null,
      internalReason: s?.internalReason || null,
    });
  };

  return (
    <div className="space-y-8">
      {/* 1. SEÇÃO PRINCIPAL: MANUTENÇÃO GLOBAL */}
      <div
        className={cn(
          "rounded-3xl border p-6 transition-all shadow-sm",
          globalEnabled
            ? "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200"
            : "border-black/[0.08] bg-white text-zinc-900 dark:border-white/[0.08] dark:bg-zinc-900/60 dark:text-zinc-100"
        )}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            {globalEnabled ? (
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Wrench className="h-6 w-6 animate-pulse" />
              </div>
            ) : (
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold sm:text-xl">
                  {globalEnabled ? "Modo de Manutenção Global ATIVO" : "Manutenção Global Desativada"}
                </h3>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                    globalEnabled
                      ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-black"
                      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  )}
                >
                  {globalEnabled ? "TODA PLATAFORMA BLOQUEADA" : "GLOBAL OFF"}
                </span>
              </div>
              <p className="mt-1 text-xs opacity-90 sm:text-sm max-w-2xl leading-relaxed">
                {globalEnabled
                  ? "O acesso de todas as empresas e usuários comuns está bloqueado (tela cheia 503). O Superadmin mantém acesso total a /admin/*."
                  : "As empresas têm acesso liberado à plataforma, exceto módulos específicos configurados abaixo."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGlobalToggleClick}
              disabled={globalMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-50",
                globalEnabled
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                  : "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
              )}
            >
              {globalEnabled ? "Encerrar Manutenção Global" : "Ativar Manutenção Global"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. SEÇÃO: MANUTENÇÃO POR SEÇÃO REAL DO NEXAFLOW */}
      <Panel title="Manutenção por Seção Operacional">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/60 sm:text-sm">
            Coloque módulos específicos em manutenção sem afetar o restante da empresa. Webhooks, agentes em atendimento e jobs de fundo continuam funcionando normalmente.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span><strong>{activeSectionsCount}</strong> de 14 seções em manutenção</span>
          </div>
        </div>

        <div className="space-y-6">
          {GROUPS.map((group) => {
            const groupSections = ALL_SECTIONS.filter((sec) => TENANT_SECTIONS[sec].group === group);
            return (
              <div key={group} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                  {group}
                </h4>

                <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  {groupSections.map((sec) => {
                    const meta = TENANT_SECTIONS[sec];
                    const state = sectionsState[sec];
                    const isSecEnabled = Boolean(state?.enabled);
                    const Icon = SECTION_ICONS[sec] || Wrench;

                    return (
                      <div
                        key={sec}
                        className={cn(
                          "flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between",
                          isSecEnabled ? "bg-amber-500/[0.04]" : "hover:bg-white/[0.02]"
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                              isSecEnabled
                                ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                                : "border-white/[0.08] bg-white/[0.04] text-white/70"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-white">
                                {meta.label}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                  isSecEnabled
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                                )}
                              >
                                {isSecEnabled ? "Em manutenção" : "Disponível"}
                              </span>
                              {state?.estimatedEnd ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
                                  <Clock className="h-3 w-3" />
                                  {state.estimatedEnd}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-white/50 truncate max-w-lg">
                              {state?.internalReason
                                ? `Motivo interno: ${state.internalReason}`
                                : meta.defaultMessage}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewMode(sec)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.08] transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Visualizar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenSectionModal(sec)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.08] transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Configurar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickToggleSection(sec)}
                            disabled={sectionMutation.isPending}
                            className={cn(
                              "inline-flex items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all disabled:opacity-50",
                              isSecEnabled
                                ? "bg-emerald-600/90 text-white hover:bg-emerald-600"
                                : "bg-amber-600/90 text-white hover:bg-amber-600"
                            )}
                          >
                            {isSecEnabled ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* 3. FORMULÁRIO DE TEXTOS DA MANUTENÇÃO GLOBAL */}
      <Panel title="Textos da Manutenção Global (Tela Cheia)">
        <p className="mb-4 text-xs text-white/50">
          Textos apresentados aos usuários das empresas quando toda a plataforma estiver em manutenção global.
        </p>
        <form onSubmit={handleSaveGlobalConfigOnly} className="space-y-4">
          <Field
            label="Título da tela de manutenção global"
            hint="Exemplo padrão: Estamos em manutenção"
          >
            <input
              type="text"
              value={globalTitle}
              onChange={(e) => setGlobalTitle(e.target.value)}
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
              value={globalMessage}
              onChange={(e) => setGlobalMessage(e.target.value)}
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
              hint="Exemplo: Hoje às 05:30 ou Em 15 minutos"
            >
              <div className="relative">
                <input
                  type="text"
                  value={globalEstimatedEnd}
                  onChange={(e) => setGlobalEstimatedEnd(e.target.value)}
                  placeholder="Ex.: Hoje às 05:30"
                  className={inputClass}
                  maxLength={100}
                />
                <Clock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              </div>
            </Field>

            <Field
              label="Motivo interno (confidencial)"
              hint="Visível somente ao Superadmin. Nunca é exibido aos clientes."
            >
              <div className="relative">
                <input
                  type="text"
                  value={globalInternalReason}
                  onChange={(e) => setGlobalInternalReason(e.target.value)}
                  placeholder="Ex.: Migração de cluster e upgrade do banco"
                  className={inputClass}
                  maxLength={500}
                />
                <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPreviewMode("global")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/[0.08]"
            >
              <Eye className="h-4 w-4" />
              Pré-visualizar Tela Global
            </button>

            <button
              type="submit"
              disabled={globalMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {globalMutation.isPending ? "Salvando..." : "Salvar Textos Globais"}
            </button>
          </div>
        </form>
      </Panel>

      {/* 4. MODAL DE CONFIGURAÇÃO DE SEÇÃO */}
      {editingSection ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-3xl border border-white/[0.12] bg-zinc-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Configurar Manutenção: {TENANT_SECTIONS[editingSection]?.label}
                  </h3>
                  <p className="text-xs text-white/50">
                    Defina status, textos personalizados e motivo interno para este módulo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSectionModal} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
                <div>
                  <p className="font-semibold text-sm text-white">Status da Seção</p>
                  <p className="text-xs text-white/50">
                    {secFormEnabled ? "Em manutenção (acesso bloqueado)" : "Disponível (acesso normal)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSecFormEnabled((v) => !v)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-xs font-semibold transition-colors",
                    secFormEnabled
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  )}
                >
                  {secFormEnabled ? "Em Manutenção" : "Disponível"}
                </button>
              </div>

              <Field
                label="Título para as Empresas"
                hint="Aparecerá no cabeçalho do módulo quando bloqueado"
              >
                <input
                  type="text"
                  value={secFormTitle}
                  onChange={(e) => setSecFormTitle(e.target.value)}
                  placeholder={TENANT_SECTIONS[editingSection]?.defaultTitle}
                  className={inputClass}
                  required
                />
              </Field>

              <Field
                label="Mensagem Explicativa"
                hint="Explique aos clientes o motivo ou que o restante da plataforma segue normal"
              >
                <textarea
                  value={secFormMessage}
                  onChange={(e) => setSecFormMessage(e.target.value)}
                  placeholder={TENANT_SECTIONS[editingSection]?.defaultMessage}
                  rows={3}
                  className={inputClass}
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Previsão de Retorno (opcional)">
                  <input
                    type="text"
                    value={secFormEstimatedEnd}
                    onChange={(e) => setSecFormEstimatedEnd(e.target.value)}
                    placeholder="Ex.: Hoje às 05:30"
                    className={inputClass}
                  />
                </Field>

                <Field label="Motivo Interno (confidencial)">
                  <input
                    type="text"
                    value={secFormInternalReason}
                    onChange={(e) => setSecFormInternalReason(e.target.value)}
                    placeholder="Ex.: Upgrade do gateway WAHA"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingSection(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sectionMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {sectionMutation.isPending ? "Salvando..." : "Salvar Configuração"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* 5. MODAL LIVE PREVIEW */}
      {previewMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/[0.12] bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-brand-400" />
                <h3 className="text-base font-bold text-white">
                  Pré-visualização:{" "}
                  {previewMode === "global"
                    ? "Tela Cheia Global"
                    : `Módulo ${TENANT_SECTIONS[previewMode]?.label}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMode(null)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4">
              {previewMode === "global" ? (
                <MaintenanceScreen
                  title={globalTitle || "Estamos em manutenção"}
                  message={
                    globalMessage ||
                    "Estamos realizando melhorias no NexaFlow. Voltaremos em breve."
                  }
                  estimatedEnd={globalEstimatedEnd || null}
                  showAdminLink={true}
                />
              ) : (
                <SectionMaintenanceView
                  section={previewMode}
                  title={sectionsState[previewMode]?.title}
                  message={sectionsState[previewMode]?.message}
                  estimatedEnd={sectionsState[previewMode]?.estimatedEnd}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 6. MODAL DE CONFIRMAÇÃO DE ATIVAÇÃO GLOBAL */}
      {showGlobalEnableModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  Ativar Modo de Manutenção Global?
                </h3>
                <p className="text-xs text-white/60">Ação de alto impacto na plataforma</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-white/70">
              Ao ativar, <strong>todas as empresas e usuários comuns</strong> serão imediatamente bloqueados da plataforma (recebendo tela cheia de manutenção com código HTTP 503). O Superadmin continuará com acesso total.
            </p>

            <label className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 cursor-pointer">
              <input
                type="checkbox"
                checked={ackGlobalBlock}
                onChange={(e) => setAckGlobalBlock(e.target.checked)}
                className="mt-0.5 rounded border-amber-500/50 bg-black/40 text-amber-500 focus:ring-amber-500"
              />
              <span>
                Entendo que o acesso de todas as empresas será temporariamente bloqueado.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowGlobalEnableModal(false);
                  setAckGlobalBlock(false);
                }}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmGlobalEnable}
                disabled={!ackGlobalBlock || globalMutation.isPending}
                className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-40"
              >
                {globalMutation.isPending ? "Ativando..." : "Confirmar Ativação Global"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 7. MODAL DE CONFIRMAÇÃO DE DESATIVAÇÃO GLOBAL */}
      {showGlobalDisableModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-emerald-500/30 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  Encerrar Manutenção Global?
                </h3>
                <p className="text-xs text-white/60">Restabelecer acesso às empresas</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-white/70">
              Todas as empresas e usuários voltarão a ter acesso imediato às seções disponíveis da plataforma.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowGlobalDisableModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmGlobalDisable}
                disabled={globalMutation.isPending}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {globalMutation.isPending ? "Encerrando..." : "Encerrar e Liberar Acesso"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
