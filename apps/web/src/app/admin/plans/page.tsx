"use client";

import { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
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
import { api, ApiError, isSuperadminMfaRequiredError } from "@/lib/api";
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
  DISCOUNT_PRESET_OPTIONS,
  formatBrlInput,
  parseBrlInput,
  formatIntegerInput,
  parseIntegerInput,
  parsePercentInput,
  slugify,
  getAnnualDiscountPercent,
  formatDiscountPercent,
  calculateAnnualPriceWithDiscount,
  calculateFullAnnualPrice,
  calculateAnnualSavings,
  detectDiscountMode,
  emptyForm,
  planToForm,
} from "@/lib/plans";

import { createPortal } from "react-dom";

function CustomSelect({
  value,
  onChange,
  options,
  size = "md",
  disabled = false,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  size?: "sm" | "md";
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeAbove: boolean } | null>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < 260 && rect.top > 260;
    setCoords({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      placeAbove,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    function handleScrollOrResize() {
      updatePosition();
    }

    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border transition-colors",
          size === "md" ? "px-3 py-2 text-[13px]" : "px-2.5 py-1.5 text-[12px]",
          disabled
            ? "border-white/[0.04] bg-white/[0.02] text-gray-500 cursor-not-allowed opacity-60"
            : "border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.06] focus:border-violet-500 focus:outline-none"
        )}
      >
        <span className="truncate">{selected?.label || placeholder || value}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150",
            open && "rotate-180",
            disabled && "opacity-40"
          )}
        />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            style={{
              position: "fixed",
              top: coords.placeAbove ? undefined : `${coords.top}px`,
              bottom: coords.placeAbove ? `${window.innerHeight - coords.top}px` : undefined,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 999999,
            }}
            className="rounded-xl border border-white/[0.1] bg-[#161a26] p-1.5 shadow-2xl backdrop-blur-lg animate-in fade-in-50 zoom-in-95 duration-100"
          >
            <div className="space-y-0.5 max-h-[260px] overflow-y-auto custom-scrollbar">
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
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-violet-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Archive confirmation state
  const [planToArchive, setPlanToArchive] = useState<Plan | null>(null);

  const { data: plans = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => api<Plan[]>("/admin/plans"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);
  const archivedPlans = useMemo(() => plans.filter((p) => !p.isActive), [plans]);

  const availablePlansCount = useMemo(() => plans.filter((p) => p.isActive).length, [plans]);
  const archivedPlansCount = useMemo(() => plans.filter((p) => !p.isActive).length, [plans]);
  const payingCompaniesCount = useMemo(() => {
    return plans
      .filter((p) => p.slug !== "free")
      .reduce((acc, p) => acc + (p.activeCustomerCount ?? 0), 0);
  }, [plans]);

  const mostPopularPlan = useMemo(() => plans.find((p) => p.isMostPopular), [plans]);
  const mostPopularLabel = useMemo(() => {
    if (mostPopularPlan) return mostPopularPlan.name;
    if (payingCompaniesCount === 0) return "Ainda sem dados";
    return "Sem líder no momento";
  }, [mostPopularPlan, payingCompaniesCount]);

  // Mutations
  const createPlanMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<Plan>("/admin/plans", { method: "POST", json: payload }),
    onSuccess: (newPlan) => {
      toast.success(
        "Plano criado",
        `O plano ${newPlan.name} foi adicionado ao catálogo comercial.`
      );
      forceCloseModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else if (err.message?.includes("identificador")) {
        setFieldErrors((prev) => ({ ...prev, slug: "Este identificador já está sendo usado por outro plano." }));
      }
      toast.error(
        "Não foi possível criar o plano",
        err.message || "Verifique os dados informados e tente novamente."
      );
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api<Plan>(`/admin/plans/${id}`, { method: "PATCH", json: payload }),
    onSuccess: (updated) => {
      toast.success(
        "Alterações salvas",
        `O plano ${updated.name} foi atualizado com sucesso no catálogo.`
      );
      forceCloseModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
      toast.error(
        "Não foi possível salvar as alterações",
        err.message || "Verifique os dados informados e tente novamente."
      );
    },
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: (id: string) =>
      api<Plan>(`/admin/plans/${id}/duplicate`, { method: "POST" }),
    onSuccess: (duplicated) => {
      toast.success(
        "Plano duplicado",
        `A cópia "${duplicated.name}" foi criada como indisponível para novas contratações.`
      );
      forceCloseModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(
        "Não foi possível duplicar o plano",
        err.message || "Erro ao gerar cópia do plano."
      );
    },
  });

  const toggleArchiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api<Plan>(`/admin/plans/${id}`, { method: "PATCH", json: { isActive } }),
    onSuccess: (_, variables) => {
      if (variables.isActive) {
        toast.success(
          "Plano restaurado",
          "O plano voltou a ficar disponível no catálogo comercial ativo."
        );
      } else {
        toast.success(
          "Plano arquivado",
          "O plano foi retirado de novas contratações e movido para Arquivados."
        );
      }
      setPlanToArchive(null);
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any, variables) => {
      toast.error(
        variables.isActive
          ? "Não foi possível restaurar o plano"
          : "Não foi possível arquivar o plano",
        err.message || "Ocorreu um erro ao atualizar o plano."
      );
    },
  });

  const openCreateModal = () => {
    const fresh = emptyForm();
    setFormData(fresh);
    setInitialFormJson(JSON.stringify(fresh));
    setEditingPlan(null);
    setSlugManuallyEdited(false);
    setShowDiscardConfirm(false);
    setFieldErrors({});
    setModalMode("create");
  };

  const openEditModal = (p: Plan) => {
    const f = planToForm(p);
    setFormData(f);
    setInitialFormJson(JSON.stringify(f));
    setEditingPlan(p);
    setSlugManuallyEdited(true);
    setShowDiscardConfirm(false);
    setFieldErrors({});
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
    setFieldErrors({});
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
    setFieldErrors({});
  };

  const handleNameChange = (nameVal: string) => {
    setFieldErrors((prev) => ({ ...prev, name: "" }));
    setFormData((prev) => {
      const next = { ...prev, name: nameVal };
      if (!slugManuallyEdited && modalMode === "create") {
        next.slug = slugify(nameVal);
      }
      return next;
    });
  };

  const handleMonthlyChange = (valStr: string) => {
    setFieldErrors((prev) => ({ ...prev, priceMonthly: "" }));
    const formatted = formatBrlInput(valStr);
    const monthlyNum = parseBrlInput(formatted);

    setFormData((prev) => {
      let nextAnnual = prev.priceAnnual;
      if (monthlyNum > 0) {
        if (prev.annualPricingMode === "percentage") {
          const pct =
            prev.discountMode === "custom"
              ? parsePercentInput(prev.customDiscountPercent)
              : parseInt(prev.discountMode, 10) || 0;
          if (pct > 0) {
            const discounted = calculateAnnualPriceWithDiscount(monthlyNum, pct);
            nextAnnual = formatBrlInput(Math.round(discounted * 100).toString());
          } else {
            const fullYear = calculateFullAnnualPrice(monthlyNum);
            nextAnnual = formatBrlInput(Math.round(fullYear * 100).toString());
          }
        } else if (prev.annualPricingMode === "full" || prev.discountMode === "0") {
          const fullYear = calculateFullAnnualPrice(monthlyNum);
          nextAnnual = formatBrlInput(Math.round(fullYear * 100).toString());
        }
        // If annualPricingMode === "manual", we preserve the manually typed annual price
      } else {
        if (prev.annualPricingMode !== "manual") {
          nextAnnual = "";
        }
      }
      return { ...prev, priceMonthly: formatted, priceAnnual: nextAnnual };
    });
  };

  const handleAnnualChange = (valStr: string) => {
    setFieldErrors((prev) => ({ ...prev, priceAnnual: "" }));
    const formatted = formatBrlInput(valStr);
    const annualNum = parseBrlInput(formatted);
    const monthlyNum = parseBrlInput(formData.priceMonthly);

    const discountPct = getAnnualDiscountPercent(monthlyNum, annualNum);
    const { mode, customVal } = detectDiscountMode(discountPct);

    setFormData((prev) => ({
      ...prev,
      priceAnnual: formatted,
      annualPricingMode: "manual",
      discountMode: mode,
      customDiscountPercent: customVal,
    }));
  };

  const handleDiscountPresetChange = (presetValue: string) => {
    const monthlyNum = parseBrlInput(formData.priceMonthly);
    if (monthlyNum <= 0) return;

    if (presetValue === "custom") {
      setFormData((prev) => ({
        ...prev,
        annualPricingMode: "percentage",
        discountMode: "custom",
      }));
      return;
    }

    const pct = parseInt(presetValue, 10) || 0;
    const annualPrice =
      pct === 0
        ? calculateFullAnnualPrice(monthlyNum)
        : calculateAnnualPriceWithDiscount(monthlyNum, pct);

    setFormData((prev) => ({
      ...prev,
      annualPricingMode: pct === 0 ? "full" : "percentage",
      discountMode: presetValue as any,
      customDiscountPercent: "",
      priceAnnual:
        annualPrice > 0 ? formatBrlInput(Math.round(annualPrice * 100).toString()) : "",
    }));
  };

  const handleCustomDiscountChange = (valStr: string) => {
    setFieldErrors((prev) => ({ ...prev, customDiscount: "" }));
    const pct = parsePercentInput(valStr);
    const monthlyNum = parseBrlInput(formData.priceMonthly);

    const discounted = calculateAnnualPriceWithDiscount(monthlyNum, pct);

    setFormData((prev) => ({
      ...prev,
      annualPricingMode: "percentage",
      discountMode: "custom",
      customDiscountPercent: valStr,
      priceAnnual:
        discounted > 0 ? formatBrlInput(Math.round(discounted * 100).toString()) : "",
    }));
  };

  const handleRemoveDiscount = () => {
    const monthlyNum = parseBrlInput(formData.priceMonthly);
    const fullYear = calculateFullAnnualPrice(monthlyNum);
    setFormData((prev) => ({
      ...prev,
      annualPricingMode: "full",
      discountMode: "0",
      customDiscountPercent: "",
      priceAnnual:
        fullYear > 0 ? formatBrlInput(Math.round(fullYear * 100).toString()) : "",
    }));
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Informe o nome comercial do plano.";
    }
    if (!formData.slug.trim()) {
      errors.slug = "Informe o identificador (slug) do plano.";
    }

    const isEnterprise = formData.priceType === "on_request";
    const isFree = formData.priceType === "free";

    let monthly = parseBrlInput(formData.priceMonthly);
    let annual = parseBrlInput(formData.priceAnnual);

    if (formData.priceType === "fixed") {
      if (monthly <= 0) {
        errors.priceMonthly = "Informe um preço mensal maior que zero.";
      }
      if (annual <= 0) {
        errors.priceAnnual = "Informe um preço anual válido.";
      }
      if (formData.discountMode === "custom" && formData.customDiscountPercent) {
        const pct = parsePercentInput(formData.customDiscountPercent);
        if (pct <= 0 || pct >= 100) {
          errors.customDiscount = "Informe um percentual entre 0,01% e 99,99%.";
        }
      }
    } else {
      monthly = 0;
      annual = 0;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error(
        "Revise os campos destacados",
        "Algumas informações precisam ser corrigidas antes de salvar."
      );
      const firstKey = Object.keys(errors)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
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
      const { slug, ...editPayload } = payload;
      updatePlanMutation.mutate({ id: editingPlan.id, payload: editPayload });
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
        <div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {displayedPlans.map((plan) => {
              const isEnterprise = Boolean(plan.priceOnRequest) || plan.slug === "enterprise";
              const isFree = plan.slug === "free" || (Number(plan.priceMonthly) === 0 && !isEnterprise);
              const monthlyPrice = Number(plan.priceMonthly || 0);
              const annualPrice = plan.priceAnnual != null ? Number(plan.priceAnnual) : null;
              const discountPct = getAnnualDiscountPercent(monthlyPrice, annualPrice);
              const feats = (plan.features || {}) as Record<string, unknown>;
              const maxAgents = feats.maxAgents != null ? Number(feats.maxAgents) : 1;
              const maxFlows = feats.maxActiveFlows != null ? Number(feats.maxActiveFlows) : 5;
              const isPopular = Boolean(plan.isMostPopular);
              const tenantCount = plan.activeCustomerCount ?? plan._count?.tenants ?? 0;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col justify-between rounded-2xl border transition-all duration-200 p-5 bg-white/[0.02] h-full",
                    isPopular
                      ? "border-violet-500/40 bg-gradient-to-b from-violet-950/20 via-white/[0.02] to-transparent shadow-lg shadow-violet-950/20"
                      : isEnterprise
                      ? "border-indigo-500/30 bg-gradient-to-b from-indigo-950/15 via-white/[0.02] to-transparent"
                      : "border-white/[0.08] hover:border-white/[0.15]"
                  )}
                >
                  {/* Top: Header e Limites do Card */}
                  <div className="flex-1 flex flex-col">
                    {/* Header: Linha Superior com Mais Popular à esquerda & Disponível à direita */}
                    <div className="min-h-[50px] flex flex-col justify-start">
                      <div className="flex items-center justify-between gap-2 h-5 mb-1">
                        <div className="h-5 flex items-center">
                          {isPopular ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-violet-300 border border-violet-500/30">
                              <Sparkles className="h-3 w-3 text-violet-400 shrink-0" />
                              <span>Mais popular</span>
                            </span>
                          ) : (
                            <span className="invisible text-[10px] select-none" aria-hidden="true">·</span>
                          )}
                        </div>

                        <StatusBadge tone={plan.isActive ? "success" : "neutral"}>
                          {plan.isActive ? "Disponível" : "Indisponível"}
                        </StatusBadge>
                      </div>

                      <h3 className="text-[16px] font-bold text-white tracking-tight truncate mt-0.5">
                        {plan.name}
                      </h3>
                    </div>

                    {/* Preço Comercial com baseline e altura rigorosamente padronizadas */}
                    <div className="mt-3 pb-3 border-b border-white/[0.06] h-[58px] flex flex-col justify-center">
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
                                  {formatDiscountPercent(discountPct)} OFF
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Descrição com altura estritamente controlada */}
                    <p className="mt-3 text-[12px] text-gray-300 line-clamp-2 h-[36px] leading-relaxed overflow-hidden">
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

                  {/* Bottom: Uso do Plano & Ações (Footer estrutural único perfeitamente alinhado) */}
                  <div className="mt-4 pt-3.5 border-t border-white/[0.06] space-y-2.5">
                    {/* Quantidade de Empresas Utilizando */}
                    <div className="flex items-center gap-1.5 text-[11.5px] text-gray-400 h-5 whitespace-nowrap overflow-hidden">
                      <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      <span className="truncate">
                        {tenantCount === 0
                          ? "Nenhuma empresa utilizando"
                          : `${tenantCount} ${tenantCount === 1 ? "empresa utilizando" : "empresas utilizando"}`}
                      </span>
                    </div>

                    {/* Ações do Card em Linha Única Padronizada */}
                    <div className="flex items-center gap-1.5 h-7">
                      {plan.isActive ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(plan)}
                            className="inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-white/[0.04] px-2.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors shrink-0"
                          >
                            <Pencil className="h-3 w-3 shrink-0" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDuplicateModal(plan)}
                            className="inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-white/[0.04] px-2.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors shrink-0"
                            title="Duplicar configurações do plano"
                          >
                            <Copy className="h-3 w-3 shrink-0" />
                            <span>Duplicar</span>
                          </button>
                          {plan.slug !== "free" && (
                            <button
                              type="button"
                              onClick={() => setPlanToArchive(plan)}
                              className="inline-flex items-center justify-center gap-1 h-7 rounded-lg px-2 text-[11.5px] font-medium text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors shrink-0 ml-auto"
                              title="Arquivar plano comercial"
                            >
                              <Archive className="h-3 w-3 shrink-0" />
                              <span>Arquivar</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleArchiveMutation.mutate({ id: plan.id, isActive: true })}
                            className="inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-violet-600 px-2.5 text-[11.5px] font-semibold text-white hover:bg-violet-500 transition-colors shadow-sm shrink-0"
                          >
                            <RotateCcw className="h-3 w-3 shrink-0" />
                            <span>Restaurar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDuplicateModal(plan)}
                            className="inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-white/[0.04] px-2.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors shrink-0"
                          >
                            <Copy className="h-3 w-3 shrink-0" />
                            <span>Duplicar</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. RESUMO DO CATÁLOGO (Faixa horizontal compacta e discreta ~60px) */}
          {!isLoading && !error && plans.length > 0 && (
            <div className="mt-5 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#12141c]/60 px-4 py-2.5 backdrop-blur-sm sm:px-5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-violet-400/80 shrink-0" />
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Resumo do catálogo
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-white tabular-nums">{availablePlansCount}</span>
                  <span className="text-gray-400">disponíveis</span>
                </div>

                <span className="hidden text-white/15 md:inline" aria-hidden>|</span>

                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-white tabular-nums">{payingCompaniesCount}</span>
                  <span className="text-gray-400">{payingCompaniesCount === 1 ? "pagante" : "pagantes"}</span>
                </div>

                <span className="hidden text-white/15 md:inline" aria-hidden>|</span>

                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">Mais popular:</span>
                  <span className="font-medium text-white">{mostPopularLabel}</span>
                </div>

                <span className="hidden text-white/15 md:inline" aria-hidden>|</span>

                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-white tabular-nums">{archivedPlansCount}</span>
                  <span className="text-gray-400">{archivedPlansCount === 1 ? "arquivado" : "arquivados"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. MODAL UNIFICADO: PlanFormDialog (Criar / Editar / Duplicar) */}
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
        footer={
          <div className="flex w-full items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={requestCloseModal}
              className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="plan-form-dialog"
              disabled={
                createPlanMutation.isPending ||
                updatePlanMutation.isPending ||
                (modalMode === "edit" && !isDirty) ||
                !formData.name.trim()
              }
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
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
        }
      >
        <form id="plan-form-dialog" onSubmit={handleFormSubmit} className="space-y-3 pb-1">
          {/* Seção 1: Informações do Plano */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Informações do Plano
            </h4>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Nome comercial *
                </label>
                <input
                  id="field-name"
                  type="text"
                  placeholder="Ex: Profissional Plus"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={cn(
                    "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white placeholder-gray-500 focus:outline-none transition-colors",
                    fieldErrors.name
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-white/[0.08] focus:border-violet-500"
                  )}
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Identificador (Slug) *
                </label>
                <input
                  id="field-slug"
                  type="text"
                  placeholder="ex: plano-plus"
                  value={formData.slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setFieldErrors((prev) => ({ ...prev, slug: "" }));
                    setFormData((prev) => ({ ...prev, slug: slugify(e.target.value) }));
                  }}
                  disabled={modalMode === "edit"}
                  readOnly={modalMode === "edit"}
                  className={cn(
                    "w-full rounded-lg border px-3 py-1.5 text-[13px] text-white focus:outline-none placeholder-gray-500 transition-colors",
                    modalMode === "edit"
                      ? "bg-white/[0.02] text-gray-400 cursor-not-allowed border-white/[0.06] select-all"
                      : fieldErrors.slug
                      ? "border-red-500/60 bg-white/[0.04] focus:border-red-500"
                      : "border-white/[0.08] bg-white/[0.04] focus:border-violet-500"
                  )}
                />
                {fieldErrors.slug && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.slug}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Descrição comercial
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Para empresas que buscam escalar o atendimento com IA e automações avançadas."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Seção 2: Precificação de Catálogo */}
          <div className="space-y-2 pt-2.5 border-t border-white/[0.06]">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Precificação de Catálogo
            </h4>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Tipo de preço *
              </label>
              <CustomSelect
                value={formData.priceType}
                onChange={(val) => setFormData((prev) => ({ ...prev, priceType: val as any }))}
                options={PRICE_TYPE_OPTIONS}
              />
            </div>

            {formData.priceType === "free" && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[12px] text-gray-400">
                Sem cobrança de catálogo comercial. As empresas vinculadas não serão cobradas mensalmente.
              </div>
            )}

            {formData.priceType === "on_request" && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[12px] text-gray-400">
                O valor e os termos comerciais serão definidos no contrato customizado de cada empresa.
              </div>
            )}

            {formData.priceType === "fixed" && (
              <div className="space-y-2">
                {/* Valores Mensal e Anual lado a lado */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                      Preço mensal (R$) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-gray-400 pointer-events-none">
                        R$
                      </span>
                      <input
                        id="field-priceMonthly"
                        type="text"
                        placeholder="0,00"
                        value={formData.priceMonthly}
                        onChange={(e) => handleMonthlyChange(e.target.value)}
                        className={cn(
                          "w-full rounded-lg border bg-white/[0.04] pl-9 pr-3 py-1.5 text-[13px] text-white placeholder-gray-500 focus:outline-none tabular-nums transition-colors",
                          fieldErrors.priceMonthly
                            ? "border-red-500/60 focus:border-red-500"
                            : "border-white/[0.08] focus:border-violet-500"
                        )}
                      />
                    </div>
                    {fieldErrors.priceMonthly && (
                      <p className="mt-1 text-[11px] text-red-400">{fieldErrors.priceMonthly}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                      Preço anual (R$) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-gray-400 pointer-events-none">
                        R$
                      </span>
                      <input
                        id="field-priceAnnual"
                        type="text"
                        placeholder="0,00"
                        value={formData.priceAnnual}
                        onChange={(e) => handleAnnualChange(e.target.value)}
                        className={cn(
                          "w-full rounded-lg border bg-white/[0.04] pl-9 pr-3 py-1.5 text-[13px] text-white placeholder-gray-500 focus:outline-none tabular-nums transition-colors",
                          fieldErrors.priceAnnual
                            ? "border-red-500/60 focus:border-red-500"
                            : "border-white/[0.08] focus:border-violet-500"
                        )}
                      />
                    </div>
                    {fieldErrors.priceAnnual && (
                      <p className="mt-1 text-[11px] text-red-400">{fieldErrors.priceAnnual}</p>
                    )}
                  </div>
                </div>

                {/* Linha Compacta de Desconto Anual */}
                {(() => {
                  const monthlyNum = parseBrlInput(formData.priceMonthly);
                  const annualNum = parseBrlInput(formData.priceAnnual);
                  const hasValidMonthly = monthlyNum > 0;
                  const discountPct = getAnnualDiscountPercent(monthlyNum, annualNum);
                  const hasDiscount = hasValidMonthly && discountPct > 0;
                  const savings = calculateAnnualSavings(monthlyNum, annualNum);

                  return (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-[11px] font-medium text-gray-400">
                          Desconto anual
                        </label>
                        {hasDiscount && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-400 border border-emerald-500/25">
                            {formatDiscountPercent(discountPct)} OFF
                          </span>
                        )}
                      </div>

                      <div
                        className={cn(
                          "grid gap-2",
                          formData.discountMode === "custom" && hasValidMonthly
                            ? "grid-cols-1 sm:grid-cols-2"
                            : "grid-cols-1"
                        )}
                      >
                        <CustomSelect
                          value={formData.discountMode}
                          onChange={handleDiscountPresetChange}
                          options={DISCOUNT_PRESET_OPTIONS}
                          disabled={!hasValidMonthly}
                          size="md"
                        />

                        {formData.discountMode === "custom" && hasValidMonthly && (
                          <div>
                            <div className="relative">
                              <input
                                id="field-customDiscount"
                                type="text"
                                inputMode="decimal"
                                placeholder="Ex: 12,5"
                                value={formData.customDiscountPercent}
                                onChange={(e) => handleCustomDiscountChange(e.target.value)}
                                className={cn(
                                  "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:outline-none tabular-nums placeholder-gray-500 transition-colors",
                                  fieldErrors.customDiscount
                                    ? "border-red-500/60 focus:border-red-500"
                                    : "border-white/[0.08] focus:border-violet-500"
                                )}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">
                                %
                              </span>
                            </div>
                            {fieldErrors.customDiscount && (
                              <p className="mt-1 text-[11px] text-red-400">
                                {fieldErrors.customDiscount}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {!hasValidMonthly ? (
                        <p className="text-[11px] text-gray-500">
                          Informe o preço mensal para configurar o desconto anual.
                        </p>
                      ) : hasDiscount ? (
                        <p className="text-[11.5px] text-emerald-400 font-medium">
                          Economia de {formatCurrency(savings)}/ano
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Seção 3: Limites do Produto */}
          <div className="space-y-2 pt-2.5 border-t border-white/[0.06]">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Limites do Produto
              </h4>
              <div
                className="group relative flex items-center gap-1.5 text-[11px] text-violet-300/90 cursor-pointer select-none"
                tabIndex={0}
              >
                <Info className="h-3.5 w-3.5 text-violet-400 shrink-0 transition-transform duration-150 group-hover:scale-110" />
                <span className="border-b border-dashed border-violet-400/40 group-hover:border-violet-300 group-hover:text-white transition-colors">
                  Limites dinâmicos
                </span>

                {/* Tooltip elegante flutuante com micro-animação */}
                <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-xl border border-violet-500/30 bg-[#161a27] p-3.5 shadow-2xl shadow-black/80 backdrop-blur-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 transition-all duration-200 origin-top-right">
                  <div className="flex items-start gap-2.5">
                    <div className="h-2 w-2 rounded-full bg-violet-400 mt-1 shrink-0 animate-pulse" />
                    <div className="space-y-1">
                      <p className="text-[12px] font-bold text-white tracking-tight">
                        Herança Dinâmica de Cotas
                      </p>
                      <p className="text-[11px] leading-relaxed text-gray-300">
                        Alterações nesses limites são aplicadas automaticamente a todas as empresas vinculadas a este plano que utilizam as cotas padrão de catálogo.
                      </p>
                    </div>
                  </div>
                  {/* Triângulo indicador discreto no topo */}
                  <div className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-violet-500/30 bg-[#161a27]" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Usuários *
                </label>
                <input
                  id="field-maxUsers"
                  type="text"
                  placeholder="1"
                  value={formData.maxUsers}
                  onChange={(e) => {
                    setFieldErrors((prev) => ({ ...prev, maxUsers: "" }));
                    setFormData((prev) => ({ ...prev, maxUsers: formatIntegerInput(e.target.value) }));
                  }}
                  required
                  className={cn(
                    "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:outline-none tabular-nums transition-colors",
                    fieldErrors.maxUsers
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-white/[0.08] focus:border-violet-500"
                  )}
                />
                {fieldErrors.maxUsers && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.maxUsers}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  WhatsApp *
                </label>
                <input
                  id="field-maxChannels"
                  type="text"
                  placeholder="1"
                  value={formData.maxChannels}
                  onChange={(e) => {
                    setFieldErrors((prev) => ({ ...prev, maxChannels: "" }));
                    setFormData((prev) => ({ ...prev, maxChannels: formatIntegerInput(e.target.value) }));
                  }}
                  required
                  className={cn(
                    "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:outline-none tabular-nums transition-colors",
                    fieldErrors.maxChannels
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-white/[0.08] focus:border-violet-500"
                  )}
                />
                {fieldErrors.maxChannels && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.maxChannels}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Agentes IA *
                </label>
                <input
                  id="field-maxAgents"
                  type="text"
                  placeholder="1"
                  value={formData.maxAgents}
                  onChange={(e) => {
                    setFieldErrors((prev) => ({ ...prev, maxAgents: "" }));
                    setFormData((prev) => ({ ...prev, maxAgents: formatIntegerInput(e.target.value) }));
                  }}
                  required
                  className={cn(
                    "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:outline-none tabular-nums transition-colors",
                    fieldErrors.maxAgents
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-white/[0.08] focus:border-violet-500"
                  )}
                />
                {fieldErrors.maxAgents && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.maxAgents}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Contatos *
                </label>
                <input
                  id="field-maxContacts"
                  type="text"
                  placeholder="500"
                  value={formData.maxContacts}
                  onChange={(e) => {
                    setFieldErrors((prev) => ({ ...prev, maxContacts: "" }));
                    setFormData((prev) => ({ ...prev, maxContacts: formatIntegerInput(e.target.value) }));
                  }}
                  required
                  className={cn(
                    "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:outline-none tabular-nums transition-colors",
                    fieldErrors.maxContacts
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-white/[0.08] focus:border-violet-500"
                  )}
                />
                {fieldErrors.maxContacts && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.maxContacts}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Fluxos *
                </label>
                <input
                  id="field-maxActiveFlows"
                  type="text"
                  placeholder="5"
                  value={formData.maxActiveFlows}
                  onChange={(e) => {
                    setFieldErrors((prev) => ({ ...prev, maxActiveFlows: "" }));
                    setFormData((prev) => ({ ...prev, maxActiveFlows: formatIntegerInput(e.target.value) }));
                  }}
                  required
                  className={cn(
                    "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:outline-none tabular-nums transition-colors",
                    fieldErrors.maxActiveFlows
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-white/[0.08] focus:border-violet-500"
                  )}
                />
                {fieldErrors.maxActiveFlows && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.maxActiveFlows}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Créditos IA / mês *
                </label>
                <input
                  id="field-maxAiMessages"
                  type="text"
                  placeholder="100"
                  value={formData.maxAiMessages}
                  onChange={(e) => {
                    setFieldErrors((prev) => ({ ...prev, maxAiMessages: "" }));
                    setFormData((prev) => ({ ...prev, maxAiMessages: formatIntegerInput(e.target.value) }));
                  }}
                  required
                  className={cn(
                    "w-full rounded-lg border bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:outline-none tabular-nums transition-colors",
                    fieldErrors.maxAiMessages
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-white/[0.08] focus:border-violet-500"
                  )}
                />
                {fieldErrors.maxAiMessages && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.maxAiMessages}</p>
                )}
              </div>
            </div>
          </div>

          {/* Seção 4: Disponibilidade & Ordem */}
          <div className="space-y-2 pt-2.5 border-t border-white/[0.06]">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Disponibilidade & Ordem
            </h4>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Ordem de exibição
              </label>
              <input
                type="number"
                placeholder="100"
                value={formData.sortOrder}
                onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: e.target.value }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5">
              <div>
                <p className="text-[12px] font-semibold text-white">Disponível para novas contratações</p>
                <p className="text-[11px] text-gray-400">
                  Novas empresas poderão visualizar e contratar este plano no catálogo comercial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  formData.isActive ? "bg-violet-600" : "bg-white/[0.1]"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    formData.isActive ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 4. MODAL: Confirmação de Descarte de Alterações Não Salvas */}
      <Modal
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title="Descartar alterações?"
        description="As alterações feitas neste plano ainda não foram salvas."
        size="sm"
        footer={
          <div className="flex w-full items-center justify-end gap-2.5">
            <button
              type="button"
              autoFocus
              onClick={() => setShowDiscardConfirm(false)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[12.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              Continuar editando
            </button>
            <button
              type="button"
              onClick={forceCloseModal}
              className="rounded-lg bg-red-600/80 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-red-600 transition-colors shadow-sm"
            >
              Descartar
            </button>
          </div>
        }
      >
        <p className="text-[12.5px] text-gray-300 leading-relaxed">
          Se fechar agora, todos os dados preenchidos serão perdidos. Tem certeza de que deseja sair?
        </p>
      </Modal>

      {/* 5. MODAL: Confirmação de Arquivamento */}
      <Modal
        open={planToArchive !== null}
        onClose={() => setPlanToArchive(null)}
        title={`Arquivar plano "${planToArchive?.name}"?`}
        description="O plano deixará de estar disponível para novas contratações no catálogo. Empresas que já utilizam este plano continuarão com seus contratos atuais sem nenhuma alteração."
        size="md"
        footer={
          <div className="flex w-full items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setPlanToArchive(null)}
              className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium text-gray-400 hover:text-white transition-colors"
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
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-amber-500 transition-colors shadow-sm"
            >
              {toggleArchiveMutation.isPending ? "Arquivando..." : "Arquivar plano"}
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-200/90 leading-relaxed">
            Planos arquivados podem ser restaurados a qualquer momento pela aba{" "}
            <strong>Arquivados</strong>. Nenhuma assinatura ou empresa vinculada será excluída.
          </div>
        </div>
      </Modal>
    </div>
  );
}
