"use client";

import { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  CreditCard,
  Pencil,
  Plus,
  Archive,
  RotateCcw,
  Check,
  ChevronDown,
  Users,
  MessageSquare,
  Bot,
  Contact,
  Workflow,
  Sparkles,
  Building2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui-toast";
import { Modal } from "@/components/ui";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  StatusBadge,
} from "@/components/admin";

import {
  type Plan,
  type PlanFormState,
  PRICE_TYPE_OPTIONS,
  BADGE_OPTIONS,
  BADGE_LABEL,
  formatBrlInput,
  parseBrlInput,
  formatIntegerInput,
  parseIntegerInput,
  slugify,
  getAnnualDiscountPercent,
  calculateAnnualPriceWithDiscount,
  calculateFullAnnualPrice,
  emptyForm,
  planToForm,
} from "@/lib/plans";

function CustomSelect({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.06] focus:border-violet-500 focus:outline-none transition-colors",
          size === "md" ? "px-3 py-2 text-[13px]" : "px-2.5 py-1.5 text-[12px]"
        )}
      >
        <span className="truncate">{selected?.label || value}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-[100] mt-1.5 w-full min-w-[220px] rounded-xl border border-white/[0.1] bg-[#161a26] p-1.5 shadow-2xl backdrop-blur-lg"
        >
          <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    size === "md" ? "text-[12.5px]" : "text-[11.5px]",
                    isSelected
                      ? "bg-violet-600/20 text-violet-300 font-medium"
                      : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-violet-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPlansPage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | "duplicate" | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<PlanFormState>(emptyForm());
  const [initialFormJson, setInitialFormJson] = useState<string>("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Archive confirmation state
  const [planToArchive, setPlanToArchive] = useState<Plan | null>(null);

  const { data: plans = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => api<Plan[]>("/admin/plans"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);
  const archivedPlans = useMemo(() => plans.filter((p) => !p.isActive), [plans]);

  // Mutations
  const createPlanMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<Plan>("/admin/plans", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Plano comercial criado com sucesso!");
      forceCloseModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar plano");
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api<Plan>(`/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Plano atualizado com sucesso!");
      forceCloseModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar plano");
    },
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: (id: string) =>
      api<Plan>(`/admin/plans/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Plano duplicado com sucesso!");
      forceCloseModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao duplicar plano");
    },
  });

  const toggleArchiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api<Plan>(`/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? "Plano restaurado para o catálogo ativo!" : "Plano arquivado com sucesso!");
      setPlanToArchive(null);
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao alterar status do plano");
    },
  });

  const openCreateModal = () => {
    const fresh = emptyForm();
    setFormData(fresh);
    setInitialFormJson(JSON.stringify(fresh));
    setEditingPlan(null);
    setSlugManuallyEdited(false);
    setShowDiscardConfirm(false);
    setModalMode("create");
  };

  const openEditModal = (p: Plan) => {
    const f = planToForm(p);
    setFormData(f);
    setInitialFormJson(JSON.stringify(f));
    setEditingPlan(p);
    setSlugManuallyEdited(true);
    setShowDiscardConfirm(false);
    setModalMode("edit");
  };

  const openDuplicateModal = (p: Plan) => {
    const f = planToForm(p);
    f.name = `${p.name} (cópia)`;
    f.slug = `${p.slug}-copia`;
    f.isActive = false;
    f.badge = "";
    f.sortOrder = ((p.sortOrder ?? 100) + 5).toString();
    setFormData(f);
    setInitialFormJson(JSON.stringify(f));
    setEditingPlan(p);
    setSlugManuallyEdited(true);
    setShowDiscardConfirm(false);
    setModalMode("duplicate");
  };

  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== initialFormJson;
  }, [formData, initialFormJson]);

  const requestCloseModal = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      forceCloseModal();
    }
  };

  const forceCloseModal = () => {
    setModalMode(null);
    setEditingPlan(null);
    setSlugManuallyEdited(false);
    setShowDiscardConfirm(false);
  };

  const handleNameChange = (nameVal: string) => {
    setFormData((prev) => {
      const next = { ...prev, name: nameVal };
      if (!slugManuallyEdited && modalMode === "create") {
        next.slug = slugify(nameVal);
      }
      return next;
    });
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("O nome do plano é obrigatório.");
      return;
    }
    if (!formData.slug.trim()) {
      toast.error("O identificador (slug) do plano é obrigatório.");
      return;
    }

    const isEnterprise = formData.priceType === "on_request";
    const isFree = formData.priceType === "free";

    let monthly = parseBrlInput(formData.priceMonthly);
    let annual = parseBrlInput(formData.priceAnnual);

    if (isEnterprise || isFree) {
      monthly = 0;
      annual = 0;
    }

    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      description: formData.description.trim() || null,
      priceOnRequest: isEnterprise,
      priceMonthly: monthly,
      priceAnnual: annual > 0 ? annual : null,
      maxUsers: parseIntegerInput(formData.maxUsers, 1),
      maxChannels: parseIntegerInput(formData.maxChannels, 1),
      maxContacts: parseIntegerInput(formData.maxContacts, 500),
      maxConversations: 10000,
      maxAiMessages: parseIntegerInput(formData.maxAiMessages, 100),
      badge: formData.badge.trim() || null,
      sortOrder: parseInt(formData.sortOrder, 10) || 100,
      isActive: formData.isActive,
      features: {
        maxAgents: parseIntegerInput(formData.maxAgents, 1),
        maxActiveFlows: parseIntegerInput(formData.maxActiveFlows, 5),
        monthlyAiCredits: parseIntegerInput(formData.maxAiMessages, 100),
      },
    };

    if (modalMode === "create" || modalMode === "duplicate") {
      createPlanMutation.mutate(payload);
    } else if (modalMode === "edit" && editingPlan) {
      updatePlanMutation.mutate({ id: editingPlan.id, payload });
    }
  };

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) return <AdminPageSkeleton metrics={0} />;

  if (error || !plans) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar os planos."
        description="Verifique a conexão e tente novamente."
        onRetry={() => void refetch()}
      />
    );
  }

  const displayedPlans = activeTab === "active" ? activePlans : archivedPlans;

  return (
    <div className="space-y-6">
      {/* 1. Header Oficial */}
      <AdminPageHeader
        title="Planos"
        description="Gerencie o catálogo comercial, preços, limites e disponibilidade dos planos."
        actions={
          <div className="flex items-center gap-3">
            {/* Tab Filter Ativos / Arquivados */}
            <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                  activeTab === "active"
                    ? "bg-white/[0.1] text-white shadow-sm font-semibold"
                    : "text-gray-400 hover:text-white"
                )}
              >
                Ativos ({activePlans.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("archived")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                  activeTab === "archived"
                    ? "bg-white/[0.1] text-white shadow-sm font-semibold"
                    : "text-gray-400 hover:text-white"
                )}
              >
                Arquivados ({archivedPlans.length})
              </button>
            </div>

            <button
              onClick={openCreateModal}
              className="admin-btn-primary inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Novo plano
            </button>
          </div>
        }
      />

      {/* 2. Grid Inteligente de Planos */}
      {displayedPlans.length === 0 ? (
        <AdminEmptyState
          title={activeTab === "active" ? "Nenhum plano disponível" : "Nenhum plano arquivado"}
          description={
            activeTab === "active"
              ? "Crie um plano para começar a montar o catálogo comercial da plataforma."
              : "Planos arquivados aparecerão aqui quando forem retirados do catálogo ativo."
          }
          action={
            activeTab === "active" ? (
              <button onClick={openCreateModal} className="admin-btn-primary inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Novo plano
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {displayedPlans.map((plan) => {
            const isEnterprise = Boolean(plan.priceOnRequest) || plan.slug === "enterprise";
            const isFree = plan.slug === "free" || Number(plan.priceMonthly) === 0 && !isEnterprise;
            const monthlyPrice = Number(plan.priceMonthly || 0);
            const annualPrice = plan.priceAnnual != null ? Number(plan.priceAnnual) : null;
            const discountPct = getAnnualDiscountPercent(monthlyPrice, annualPrice);
            const feats = (plan.features || {}) as Record<string, unknown>;
            const maxAgents = feats.maxAgents != null ? Number(feats.maxAgents) : 1;
            const maxFlows = feats.maxActiveFlows != null ? Number(feats.maxActiveFlows) : 5;
            const badgeKey = plan.badge || "";
            const isPopular = badgeKey === "popular";
            const tenantCount = plan._count?.tenants ?? 0;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-2xl border transition-all duration-200 p-5 bg-white/[0.02]",
                  isPopular
                    ? "border-violet-500/40 bg-gradient-to-b from-violet-950/20 via-white/[0.02] to-transparent shadow-lg shadow-violet-950/20"
                    : isEnterprise
                    ? "border-indigo-500/30 bg-gradient-to-b from-indigo-950/15 via-white/[0.02] to-transparent"
                    : "border-white/[0.08] hover:border-white/[0.15]"
                )}
              >
                {/* Top: Header do Card (sem slug técnico visível) */}
                <div>
                  <div className="flex items-start justify-between gap-2 min-h-[32px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-[16px] font-bold text-white tracking-tight">
                        {plan.name}
                      </h3>
                      {badgeKey && BADGE_LABEL[badgeKey] && (
                        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-violet-300 border border-violet-500/30">
                          {BADGE_LABEL[badgeKey]}
                        </span>
                      )}
                    </div>

                    <StatusBadge tone={plan.isActive ? "success" : "neutral"}>
                      {plan.isActive ? "Disponível" : "Indisponível"}
                    </StatusBadge>
                  </div>

                  {/* Preço Comercial com baseline consistente */}
                  <div className="mt-3.5 pb-3 border-b border-white/[0.06] min-h-[56px] flex flex-col justify-end">
                    {isEnterprise ? (
                      <div>
                        <span className="text-[20px] font-bold text-white">Sob consulta</span>
                        <p className="text-[11.5px] text-gray-400 mt-0.5">Contrato customizado</p>
                      </div>
                    ) : isFree ? (
                      <div>
                        <span className="text-[22px] font-bold text-white">Gratuito</span>
                        <p className="text-[11.5px] text-gray-400 mt-0.5">Sem cobrança mensal</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-[22px] font-extrabold text-white tabular-nums">
                            {formatCurrency(monthlyPrice)}
                          </span>
                          <span className="text-[12px] text-gray-400 font-medium">/mês</span>
                        </div>
                        {annualPrice != null && annualPrice > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[11.5px] text-gray-400 tabular-nums">
                              ou {formatCurrency(annualPrice)}/ano
                            </p>
                            {discountPct > 0 && (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-bold text-emerald-400 border border-emerald-500/25">
                                {discountPct}% OFF
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Descrição com área previsível */}
                  <p className="mt-3 text-[12px] text-gray-300 line-clamp-2 min-h-[36px] leading-relaxed">
                    {plan.description || "Plano comercial para atendimento e automação."}
                  </p>

                  {/* Grade de 6 Limites Oficiais */}
                  <div className="mt-4 space-y-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] p-3.5 text-[12px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Users className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Usuários
                      </span>
                      <span className={cn("font-semibold tabular-nums text-right shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : plan.maxUsers.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <MessageSquare className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        WhatsApp
                      </span>
                      <span className={cn("font-semibold tabular-nums text-right shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : plan.maxChannels.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Bot className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Agentes IA
                      </span>
                      <span className={cn("font-semibold tabular-nums text-right shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : maxAgents.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Contact className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Contatos
                      </span>
                      <span className={cn("font-semibold tabular-nums text-right shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : plan.maxContacts.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Workflow className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Fluxos
                      </span>
                      <span className={cn("font-semibold tabular-nums text-right shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : maxFlows.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Créditos IA / mês
                      </span>
                      <span className={cn("font-semibold tabular-nums text-right shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : plan.maxAiMessages.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom: Uso do Plano & Ações */}
                <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-3">
                  {/* Quantidade de Empresas Utilizando (separado dos limites!) */}
                  <div className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
                    <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    <span>
                      {tenantCount === 0
                        ? "Nenhuma empresa utilizando"
                        : `${tenantCount} ${tenantCount === 1 ? "empresa utilizando" : "empresas utilizando"}`}
                    </span>
                  </div>

                  {/* Ações do Card */}
                  <div className="flex items-center justify-between gap-1.5">
                    {plan.isActive ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(plan)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => openDuplicateModal(plan)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors"
                          title="Duplicar configurações do plano"
                        >
                          <Copy className="h-3 w-3" />
                          Duplicar
                        </button>
                        {plan.slug !== "free" && (
                          <button
                            type="button"
                            onClick={() => setPlanToArchive(plan)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                            title="Arquivar plano comercial"
                          >
                            <Archive className="h-3 w-3" />
                            Arquivar
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleArchiveMutation.mutate({ id: plan.id, isActive: true })}
                          className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-violet-500 transition-colors shadow-sm"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restaurar plano
                        </button>
                        <button
                          type="button"
                          onClick={() => openDuplicateModal(plan)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          Duplicar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. MODAL UNIFICADO REFINADO: PlanFormDialog (Criar / Editar / Duplicar) */}
      <Modal
        open={modalMode !== null}
        onClose={requestCloseModal}
        title={
          modalMode === "create"
            ? "Novo Plano Comercial"
            : modalMode === "edit"
            ? `Editar Plano: ${editingPlan?.name}`
            : `Duplicar Plano: ${editingPlan?.name}`
        }
        description={
          modalMode === "edit"
            ? "Alterações no catálogo não modificam preços contratados pelas empresas existentes."
            : modalMode === "duplicate"
            ? "Crie uma cópia independente. O novo plano nasce indisponível para novas contratações."
            : "Defina preços de catálogo, limites técnicos e disponibilidade comercial."
        }
        size="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4.5">
          {/* Seção 1: Informações do Plano */}
          <div className="space-y-2.5">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              Informações do Plano
            </h4>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Nome comercial *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Profissional Plus"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Identificador (Slug) *
                </label>
                <input
                  type="text"
                  placeholder="ex: plano-plus"
                  value={formData.slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setFormData((prev) => ({ ...prev, slug: slugify(e.target.value) }));
                  }}
                  disabled={modalMode === "edit"}
                  required
                  className={cn(
                    "w-full rounded-lg border border-white/[0.08] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none placeholder-gray-500",
                    modalMode === "edit" ? "bg-white/[0.02] text-gray-400 cursor-not-allowed" : "bg-white/[0.04]"
                  )}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                Descrição comercial
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Para empresas que buscam escalar o atendimento com IA e automações avançadas."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Seção 2: Precificação de Catálogo */}
          <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              Precificação de Catálogo
            </h4>

            <div>
              <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                Tipo de preço *
              </label>
              <CustomSelect
                value={formData.priceType}
                onChange={(val) => setFormData((prev) => ({ ...prev, priceType: val as any }))}
                options={PRICE_TYPE_OPTIONS}
              />
            </div>

            {formData.priceType === "free" && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] text-gray-400">
                Sem cobrança de catálogo comercial. As empresas cadastradas no plano gratuito não serão cobradas mensalmente.
              </div>
            )}

            {formData.priceType === "on_request" && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] text-gray-400">
                O valor e os termos comerciais serão definidos individualmente no contrato personalizado da empresa.
              </div>
            )}

            {formData.priceType === "fixed" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                    Preço mensal (R$) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-gray-400 pointer-events-none">
                      R$
                    </span>
                    <input
                      type="text"
                      placeholder="0,00"
                      value={formData.priceMonthly}
                      onChange={(e) => setFormData((prev) => ({ ...prev, priceMonthly: formatBrlInput(e.target.value) }))}
                      required
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-9 pr-3 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  {(() => {
                    const parsedM = parseBrlInput(formData.priceMonthly);
                    const parsedA = parseBrlInput(formData.priceAnnual);
                    const discountPct = getAnnualDiscountPercent(parsedM, parsedA);
                    const suggested15 = calculateAnnualPriceWithDiscount(parsedM, 15);
                    const fullYear = calculateFullAnnualPrice(parsedM);

                    return (
                      <>
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                          <label className="block text-[11.5px] font-medium text-gray-400">
                            Preço anual (R$)
                          </label>
                          {parsedM > 0 && (
                            <div className="flex items-center gap-1.5">
                              {discountPct > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData((prev) => ({
                                      ...prev,
                                      priceAnnual: formatBrlInput(Math.round(fullYear * 100).toString()),
                                    }));
                                    toast.info(`Desconto removido. Valor anual integral: ${formatCurrency(fullYear)}/ano`);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 text-[11px] font-medium transition-colors cursor-pointer"
                                  title="Remover desconto e restaurar preço anual integral (mensal x 12)"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Remover desconto
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData((prev) => ({
                                      ...prev,
                                      priceAnnual: formatBrlInput(Math.round(suggested15 * 100).toString()),
                                    }));
                                    toast.success(`Desconto de 15% aplicado: ${formatCurrency(suggested15)}/ano`);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/25 text-[11px] font-semibold transition-colors cursor-pointer"
                                  title="Calcular valor anual com 15% de desconto"
                                >
                                  <Sparkles className="h-3 w-3 text-violet-400" />
                                  Aplicar -15% · {formatCurrency(suggested15)}/ano
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-gray-400 pointer-events-none">
                            R$
                          </span>
                          <input
                            type="text"
                            placeholder="0,00"
                            value={formData.priceAnnual}
                            onChange={(e) => setFormData((prev) => ({ ...prev, priceAnnual: formatBrlInput(e.target.value) }))}
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-9 pr-20 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none tabular-nums"
                          />
                          {discountPct > 0 && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/25">
                              {discountPct}% OFF
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Seção 3: Limites do Produto em 3 colunas */}
          <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
                Limites do Produto
              </h4>
              {modalMode === "edit" && (
                <span className="text-[11px] text-amber-300/80 flex items-center gap-1">
                  <Info className="h-3 w-3 text-amber-400" />
                  Alterações afetam empresas vinculadas
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Usuários *
                </label>
                <input
                  type="text"
                  placeholder="1"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxUsers: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  WhatsApp *
                </label>
                <input
                  type="text"
                  placeholder="1"
                  value={formData.maxChannels}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxChannels: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Agentes IA *
                </label>
                <input
                  type="text"
                  placeholder="1"
                  value={formData.maxAgents}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxAgents: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Contatos *
                </label>
                <input
                  type="text"
                  placeholder="500"
                  value={formData.maxContacts}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxContacts: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Fluxos *
                </label>
                <input
                  type="text"
                  placeholder="5"
                  value={formData.maxActiveFlows}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxActiveFlows: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Créditos IA / mês *
                </label>
                <input
                  type="text"
                  placeholder="100"
                  value={formData.maxAiMessages}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxAiMessages: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Seção 4: Exibição & Disponibilidade */}
          <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              Exibição & Disponibilidade
            </h4>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Destaque comercial
                </label>
                <CustomSelect
                  value={formData.badge}
                  onChange={(val) => setFormData((prev) => ({ ...prev, badge: val }))}
                  options={BADGE_OPTIONS}
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Ordem de exibição
                </label>
                <input
                  type="number"
                  placeholder="100"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div>
                <p className="text-[12.5px] font-semibold text-white">Disponível para novas contratações</p>
                <p className="text-[11px] text-gray-400">
                  Novas empresas poderão visualizar e contratar este plano no catálogo comercial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  formData.isActive ? "bg-violet-600" : "bg-white/[0.1]"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    formData.isActive ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          {/* Sticky Footer com Ações */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={requestCloseModal}
              className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                createPlanMutation.isPending ||
                updatePlanMutation.isPending ||
                (modalMode === "edit" && !isDirty)
              }
              className="rounded-lg bg-violet-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {createPlanMutation.isPending || updatePlanMutation.isPending
                ? "Salvando..."
                : modalMode === "create"
                ? "Criar plano"
                : modalMode === "duplicate"
                ? "Criar cópia"
                : "Salvar alterações"}
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. MODAL: Confirmação de Descarte de Alterações Não Salvas */}
      <Modal
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title="Descartar alterações não salvas?"
        description="Você possui alterações não salvas no formulário. Se você sair agora, todos os dados modificados serão perdidos."
        size="sm"
      >
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => setShowDiscardConfirm(false)}
            className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-gray-400 hover:text-white transition-colors"
          >
            Continuar editando
          </button>
          <button
            type="button"
            onClick={forceCloseModal}
            className="rounded-lg bg-red-600/90 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-red-500 transition-colors shadow-sm"
          >
            Descartar alterações
          </button>
        </div>
      </Modal>

      {/* 5. MODAL: Confirmação de Arquivamento */}
      <Modal
        open={planToArchive !== null}
        onClose={() => setPlanToArchive(null)}
        title={`Arquivar plano "${planToArchive?.name}"?`}
        description="O plano deixará de estar disponível para novas contratações no catálogo. Empresas que já utilizam este plano continuarão com seus contratos atuais sem nenhuma alteração."
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[12px] text-amber-200/90 leading-relaxed">
              Planos arquivados podem ser restaurados a qualquer momento pela aba{" "}
              <strong>Arquivados</strong>. Nenhuma assinatura ou empresa vinculada será excluída.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setPlanToArchive(null)}
              className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (planToArchive) {
                  toggleArchiveMutation.mutate({ id: planToArchive.id, isActive: false });
                }
              }}
              disabled={toggleArchiveMutation.isPending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-amber-500 transition-colors shadow-sm"
            >
              {toggleArchiveMutation.isPending ? "Arquivando..." : "Arquivar plano"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
