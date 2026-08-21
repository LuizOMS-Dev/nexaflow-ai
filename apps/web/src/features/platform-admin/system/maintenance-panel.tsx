"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
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
  AlertTriangle,
  Calendar,
  Building2,
  Search,
  Bell,
  User,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { platformAdminApi } from "../api";
import {
  ErrorHint,
  Field,
  Panel,
  Skeleton,
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

function formatFriendlyDateTime(dtStr?: string | null): string {
  if (!dtStr) return "";
  try {
    const d = new Date(dtStr);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
      const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      if (isToday) return `Hoje às ${timeStr}`;
      if (isTomorrow) return `Amanhã às ${timeStr}`;
      return `${d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })} às ${timeStr}`;
    }
  } catch {}
  return dtStr;
}

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

  // Live Preview Modal
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
          ? "Manutenção global ativada"
          : "Manutenção global encerrada",
        description: res.state.enabled
          ? "O acesso das empresas foi bloqueado com sucesso."
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
          ? `Módulo ${secMeta?.label || vars.section} em manutenção`
          : `Módulo ${secMeta?.label || vars.section} disponível`,
        description: vars.enabled
          ? `O acesso ao módulo de ${secMeta?.label} foi pausado para as empresas.`
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
      {/* 1. CABEÇALHO DA MANUTENÇÃO GLOBAL */}
      <div
        className={cn(
          "rounded-3xl border p-6 transition-all shadow-sm",
          globalEnabled
            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
            : "border-white/[0.08] bg-white/[0.02] text-zinc-100"
        )}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            {globalEnabled ? (
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400">
                <Wrench className="h-5 w-5 animate-pulse" />
              </div>
            ) : (
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg font-bold text-white">Manutenção global</h3>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide",
                    globalEnabled
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                  )}
                >
                  {globalEnabled ? "Em manutenção" : "Disponível"}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/60 sm:text-sm max-w-2xl leading-relaxed">
                {globalEnabled
                  ? "O acesso das empresas está temporariamente bloqueado. O Superadmin mantém acesso total a /admin/*."
                  : "Todas as áreas das empresas estão disponíveis para acesso operacional."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handleGlobalToggleClick}
              disabled={globalMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer",
                globalEnabled
                  ? "bg-zinc-800 text-white hover:bg-zinc-700 border border-white/10"
                  : "bg-brand-600 text-white hover:bg-brand-500"
              )}
            >
              {globalEnabled ? "Encerrar manutenção" : "Ativar manutenção global"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. SEÇÃO: MANUTENÇÃO POR SEÇÃO */}
      <Panel title="Manutenção por seção">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/60 sm:text-sm">
            Coloque módulos específicos em manutenção sem afetar o restante da empresa. Webhooks e processos internos continuam ativos.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1 text-xs text-white/80 shrink-0 self-start sm:self-auto">
            {activeSectionsCount > 0 ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span>
                  <strong>{activeSectionsCount}</strong> {activeSectionsCount === 1 ? "módulo em manutenção" : "módulos em manutenção"}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Todos os módulos disponíveis</span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {GROUPS.map((group) => {
            const groupSections = ALL_SECTIONS.filter((sec) => TENANT_SECTIONS[sec].group === group);
            return (
              <div key={group} className="space-y-2.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/40 px-1">
                  {group}
                </h4>

                <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  {groupSections.map((sec) => {
                    const meta = TENANT_SECTIONS[sec];
                    const state = sectionsState[sec];
                    const isSecEnabled = Boolean(state?.enabled);
                    const Icon = SECTION_ICONS[sec] || Wrench;
                    const friendlyTime = formatFriendlyDateTime(state?.estimatedEnd);

                    return (
                      <div
                        key={sec}
                        className={cn(
                          "flex flex-col gap-3 p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between",
                          isSecEnabled ? "bg-amber-500/[0.04]" : "hover:bg-white/[0.02]"
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
                              isSecEnabled
                                ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                                : "border-white/[0.08] bg-white/[0.04] text-white/70"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-xs text-white sm:text-sm">
                                {meta.label}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                                  isSecEnabled
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                                )}
                              >
                                {isSecEnabled
                                  ? friendlyTime
                                    ? `Em manutenção · Retorno previsto ${friendlyTime.toLowerCase()}`
                                    : "Em manutenção"
                                  : "Disponível"}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-white/50 leading-normal">
                              {state?.internalReason
                                ? `Motivo interno: ${state.internalReason}`
                                : meta.shortDescription || meta.defaultMessage}
                            </p>
                          </div>
                        </div>

                        {/* Ações da linha */}
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 pt-1 sm:pt-0">
                          <button
                            type="button"
                            onClick={() => setPreviewMode(sec)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                            title="Visualizar tela do usuário"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">Visualizar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenSectionModal(sec)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                          >
                            <Sliders className="h-3.5 w-3.5" />
                            <span>Configurar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickToggleSection(sec)}
                            disabled={sectionMutation.isPending}
                            className={cn(
                              "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer",
                              isSecEnabled
                                ? "bg-zinc-800 text-white hover:bg-zinc-700 border border-white/10"
                                : "bg-brand-600 text-white hover:bg-brand-500"
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
      <Panel title="Tela de manutenção global">
        <p className="mb-4 text-xs text-white/50">
          Personalize as informações apresentadas aos usuários das empresas quando a plataforma estiver em manutenção global.
        </p>
        <form onSubmit={handleSaveGlobalConfigOnly} className="space-y-4">
          <Field
            label="Título"
            hint="Exemplo: Estamos em manutenção"
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
            label="Mensagem"
            hint="Explique brevemente que a plataforma está em atualização e retornará em breve."
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
              hint="Data/horário estimado ou texto amigável."
            >
              <div className="relative">
                <input
                  type="text"
                  value={globalEstimatedEnd}
                  onChange={(e) => setGlobalEstimatedEnd(e.target.value)}
                  placeholder="Ex.: Hoje às 06:00 ou 21 de agosto às 06:00"
                  className={inputClass}
                  maxLength={100}
                />
                <Calendar className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              </div>
            </Field>

            <Field
              label="Motivo interno (confidencial)"
              hint="Visível somente ao Superadmin no painel de controle."
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
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/[0.08] cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              Pré-visualizar
            </button>

            <button
              type="submit"
              disabled={globalMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              {globalMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </Panel>

      {/* 4. MODAL DE CONFIGURAÇÃO DE SEÇÃO */}
      {editingSection ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-3xl border border-white/[0.12] bg-zinc-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Configurar: {TENANT_SECTIONS[editingSection]?.label}
                  </h3>
                  <p className="text-xs text-white/50">
                    Defina status, textos personalizados e motivo interno para este módulo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSectionModal} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
                <div>
                  <p className="font-semibold text-sm text-white">Status do módulo</p>
                  <p className="text-xs text-white/50">
                    {secFormEnabled ? "Em manutenção (acesso bloqueado)" : "Disponível (acesso normal)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSecFormEnabled((v) => !v)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer",
                    secFormEnabled
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-brand-600 text-white hover:bg-brand-500"
                  )}
                >
                  {secFormEnabled ? "Em manutenção" : "Disponível"}
                </button>
              </div>

              <Field
                label="Título para as empresas"
                hint="Exibido no cabeçalho do módulo quando estiver indisponível."
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
                label="Mensagem explicativa"
                hint="Explique aos clientes o motivo e que as demais áreas continuam normais."
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
                <Field label="Previsão de retorno (opcional)">
                  <input
                    type="text"
                    value={secFormEstimatedEnd}
                    onChange={(e) => setSecFormEstimatedEnd(e.target.value)}
                    placeholder="Ex.: Hoje às 06:00"
                    className={inputClass}
                  />
                </Field>

                <Field label="Motivo interno (confidencial)">
                  <input
                    type="text"
                    value={secFormInternalReason}
                    onChange={(e) => setSecFormInternalReason(e.target.value)}
                    placeholder="Ex.: Upgrade do gateway de IA"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingSection(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sectionMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {sectionMutation.isPending ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* 5. MODAL LIVE PREVIEW (GLOBAL: TELA CHEIA / SEÇÃO: SHELL REAL COM SIDEBAR) */}
      {previewMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-white/[0.12] bg-zinc-950 shadow-2xl overflow-hidden">
            {/* Barra superior do Modal */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-zinc-900/90 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Eye className="h-4 w-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">
                  Pré-visualização do Cliente:{" "}
                  <span className="text-white/60 font-normal">
                    {previewMode === "global"
                      ? "Tela cheia de manutenção global"
                      : `Módulo ${TENANT_SECTIONS[previewMode]?.label} (com layout e sidebar da empresa)`}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMode(null)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo do Preview */}
            <div className="flex-1 overflow-y-auto bg-black">
              {previewMode === "global" ? (
                <div className="min-h-[500px] p-6 flex items-center justify-center">
                  <MaintenanceScreen
                    title={globalTitle || "Estamos em manutenção"}
                    message={
                      globalMessage ||
                      "Estamos realizando melhorias no NexaFlow para oferecer uma experiência ainda melhor. Voltaremos em breve."
                    }
                    estimatedEnd={globalEstimatedEnd || null}
                    showAdminLink={true}
                  />
                </div>
              ) : (
                /* SHELL REAL DA EMPRESA PARA PREVIEW DE SEÇÃO */
                <div className="flex min-h-[560px] flex-col md:flex-row">
                  {/* Sidebar simulado realista da empresa */}
                  <aside className="w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-white/[0.08] bg-[#0c0d12] p-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      {/* Logo / Nome da Empresa */}
                      <div className="flex items-center gap-2.5 px-2 py-1">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-xs">
                          NF
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">Empresa Exemplo</p>
                          <p className="text-[10px] text-white/40 truncate">Plano Pro</p>
                        </div>
                      </div>

                      {/* Itens do Menu com Grupos */}
                      <nav className="space-y-3">
                        {GROUPS.map((grp) => {
                          const grpSections = ALL_SECTIONS.filter((s) => TENANT_SECTIONS[s].group === grp);
                          return (
                            <div key={grp} className="space-y-1">
                              <p className="px-2 text-[9px] font-semibold uppercase tracking-wider text-white/30">
                                {grp}
                              </p>
                              {grpSections.map((s) => {
                                const isCurrent = s === previewMode;
                                const SIcon = SECTION_ICONS[s] || LayoutDashboard;
                                return (
                                  <div
                                    key={s}
                                    className={cn(
                                      "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors select-none",
                                      isCurrent
                                        ? "bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30"
                                        : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 truncate">
                                      <SIcon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate">{TENANT_SECTIONS[s].label}</span>
                                    </div>
                                    {isCurrent ? (
                                      <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[8px] font-bold uppercase text-amber-300">
                                        Manutenção
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </nav>
                    </div>

                    <div className="pt-4 border-t border-white/[0.06] flex items-center gap-2 px-2 text-xs text-white/50">
                      <User className="h-4 w-4 text-white/40" />
                      <span className="truncate">admin@empresa.com</span>
                    </div>
                  </aside>

                  {/* Área Principal Renderizando o SectionMaintenanceView */}
                  <main className="flex-1 bg-[#090a0f] p-4 sm:p-8 flex items-center justify-center">
                    <SectionMaintenanceView
                      section={previewMode}
                      title={sectionsState[previewMode]?.title}
                      message={sectionsState[previewMode]?.message}
                      estimatedEnd={sectionsState[previewMode]?.estimatedEnd}
                      disabledSections={sectionsState}
                    />
                  </main>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 6. MODAL DE CONFIRMAÇÃO DE ATIVAÇÃO GLOBAL */}
      {showGlobalEnableModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-white/[0.12] bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  Ativar modo de manutenção global?
                </h3>
                <p className="text-xs text-white/60">Acesso das empresas será bloqueado</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-white/70">
              Todas as empresas e usuários comuns receberão a tela de manutenção com código HTTP 503. O Superadmin continuará com acesso total a /admin/*.
            </p>

            <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={ackGlobalBlock}
                onChange={(e) => setAckGlobalBlock(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-black/40 text-brand-600 focus:ring-brand-500"
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
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmGlobalEnable}
                disabled={!ackGlobalBlock || globalMutation.isPending}
                className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-40 cursor-pointer"
              >
                {globalMutation.isPending ? "Ativando..." : "Confirmar ativação"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 7. MODAL DE CONFIRMAÇÃO DE DESATIVAÇÃO GLOBAL */}
      {showGlobalDisableModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-emerald-500/30 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  Encerrar manutenção global?
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
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmGlobalDisable}
                disabled={globalMutation.isPending}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
              >
                {globalMutation.isPending ? "Encerrando..." : "Encerrar e liberar acesso"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
